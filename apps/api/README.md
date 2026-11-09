# `@csl/api`

NestJS API. It is the only part of the platform that talks to the database and to Vonage. See the [architecture overview](../../docs/architecture/README.md).

## Configuration

Copy `.env.example` to `.env` and adjust the values. `DATABASE_URL` is required: the API refuses to start if it is missing or is not a `postgres://` or `postgresql://` URL.

Any PostgreSQL 17 works. The easiest way is the one in the root `docker-compose.yml`:

```sh
docker compose up -d postgres
```

## Database

The schema is defined with [Drizzle ORM](https://orm.drizzle.team) in `src/database/schema/`, and SQL migrations live in `drizzle/`. Why Drizzle, and the schema conventions, are in [ADR 0005](../../docs/adr/0005-orm-and-migrations.md).

Migrations never run when the API starts. They are always a separate step.

| Script                                     | What it does                                                        |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm --filter ./apps/api run db:generate` | Compare the schema with the last migration and write a new SQL file |
| `pnpm --filter ./apps/api run db:migrate`  | Apply pending migrations to `DATABASE_URL`                          |
| `pnpm --filter ./apps/api run db:check`    | Check that the migration files are consistent                       |
| `pnpm --filter ./apps/api run db:seed`     | Insert the [demo data](#demo-data) into `DATABASE_URL`              |

`db:generate` loads the schema, which imports `@csl/shared-types`, so build it first if you haven't: `pnpm exec turbo run build --filter=@csl/shared-types`. The `db:*` scripts read `apps/api/.env` if it exists.

### Demo data

`db:seed` fills a local database with a small, consistent set of customers, a driver with a route, orders and incidents, so you can try the API, the PWA and the CRM without writing SQL. It runs the compiled script, so build the API first:

```sh
pnpm --filter ./apps/api run db:migrate
pnpm exec turbo run build --filter=@csl/api
pnpm --filter ./apps/api run db:seed
```

- It refuses to run when `NODE_ENV=production`.
- It is idempotent: every row has a fixed id and is inserted with `ON CONFLICT DO NOTHING`, all in one transaction. Running it again changes nothing, and it never touches rows it didn't create.
- Because existing rows are never updated, changes to the demo data in `src/database/seed-data.ts` don't reach a database that is already seeded. Recreate the database to start over.
- The e2e tests empty the tables, so seed again after running them against the same database.

The data is in `src/database/seed-data.ts`, and `seed-data.spec.ts` checks that every incident's event history is a valid path through the state machine.

#### Seeded actors

Paste the value into **Authorize** in [Swagger UI](#openapi) or into the `X-Dev-Actor` header.

| `X-Dev-Actor`                                    | Who           | Locale | What they have                                                    |
| ------------------------------------------------ | ------------- | ------ | ----------------------------------------------------------------- |
| `customer:5eed0000-0000-4000-8000-0000000000c1`  | Lucía Martín  | `es`   | An `open` incident on a failed order, an `escalated` one on a pending order |
| `customer:5eed0000-0000-4000-8000-0000000000c2`  | Carlos Romero | `es`   | Incidents in `notified`, `escalated` and `resolved`               |
| `customer:5eed0000-0000-4000-8000-0000000000c3`  | Emma Wilson   | `en`   | Two incidents `in_mediation`                                      |
| `customer:5eed0000-0000-4000-8000-0000000000c4`  | James Taylor  | `en`   | A `resolved` incident and a pending order without incidents       |
| `agent:5eed0000-0000-4000-8000-0000000000a1`     | Agent A       | —      | Assigned to one `in_mediation` and one `resolved` incident        |
| `agent:5eed0000-0000-4000-8000-0000000000a2`     | Agent B       | —      | Assigned to one `escalated` and one `resolved` incident           |

Every agent sees every incident in `GET /incidents`. Four of them are unassigned (`?agentId=unassigned`). The driver is Javier Molina (`+34611000009`), on the route of `2026-11-02`.

### Changing the schema

1. Edit the tables in `src/database/schema/`.
2. Run `db:generate --name <short_description>` and review the SQL it writes.
3. Run `db:migrate` against your local database.
4. Commit the schema change and the files in `drizzle/` together.

For SQL that Drizzle can't express (triggers, functions), create an empty migration with `pnpm exec drizzle-kit generate --custom --name <short_description>` from `apps/api` and write the SQL by hand. `drizzle/0001_incident_events_append_only.sql` is an example.

Applied migrations are never edited. To fix one, write a new migration.

### Environments

- **Local:** `pnpm --filter ./apps/api run db:migrate`.
- **CI:** the `api` job checks that `drizzle/` matches the schema (`db:check`, then `db:generate` must produce no changes), and runs `db:migrate` against its PostgreSQL service before the tests.
- **Docker image:** `drizzle-kit` is not in the production image. The image includes the compiled migrator and the `drizzle/` folder, so run it as a one-off command before starting the new version:

  ```sh
  docker run --rm -e DATABASE_URL=... <api-image> node dist/database/migrate.js
  ```

## Health checks

| Endpoint            | Purpose   | Response                                                                               |
| ------------------- | --------- | -------------------------------------------------------------------------------------- |
| `GET /health`       | Liveness  | Always `200 { status: 'ok', version }`, even with the database down                    |
| `GET /health/ready` | Readiness | `200 { status: 'ok', database: 'up' }`, or `503 { status: 'error', database: 'down' }` |

## REST API

The request and response schemas live in [`@csl/contracts`](../../packages/contracts) ([ADR 0007](../../docs/adr/0007-zod-schemas-as-runtime-contract.md)), so the API and its clients share one contract.

| Method  | Path                    | Who                    | What                                                           |
| ------- | ----------------------- | ---------------------- | -------------------------------------------------------------- |
| `POST`  | `/incidents`            | customer               | Create an incident for one of their orders                     |
| `GET`   | `/incidents`            | agent                  | CRM inbox, filtered and paginated                              |
| `GET`   | `/incidents/:id`        | customer (own) / agent | Detail with order, customer, driver, events and communications |
| `PATCH` | `/incidents/:id/status` | agent                  | Change the status through the state machine                    |
| `GET`   | `/orders`               | customer               | The customer's orders                                          |

### Listing incidents

`GET /incidents` accepts these query parameters, all optional:

| Parameter                   | Meaning                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `status`                    | One status, or several by repeating it: `?status=open&status=notified`      |
| `type`                      | Incident type                                                               |
| `agentId`                   | An agent's UUID, or `unassigned` for incidents without an agent             |
| `createdFrom` / `createdTo` | ISO 8601 date-times, both included                                          |
| `q`                         | Case-insensitive search in the order id and the customer's name and phone   |
| `sort` / `order`            | `createdAt` (default) or `updatedAt`; `desc` (default) or `asc`             |
| `limit` / `offset`          | Pagination, `limit` from 1 to 100 (default 20), `offset` from 0 (default 0) |

Pagination is `limit` / `offset`. The response is `{ items, total, limit, offset }`, where `total` counts every incident that matches the filters.

### Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [{ "path": "orderId", "message": "Invalid UUID" }]
  }
}
```

| Status | `code`                                                    | When                                                                  |
| ------ | --------------------------------------------------------- | --------------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED`                                       | Invalid body, query or path; `details` lists each offending field     |
| 400    | `BAD_REQUEST`                                             | Malformed request, such as invalid JSON                               |
| 401    | `UNAUTHORIZED`                                            | Missing or invalid `X-Dev-Actor` header, or dev auth disabled         |
| 403    | `FORBIDDEN`                                               | The actor can't use the route, such as an agent calling `GET /orders` |
| 404    | `NOT_FOUND`                                               | Missing resource, or one that belongs to another customer             |
| 409    | `INVALID_TRANSITION` / `TRANSITION_NOT_ALLOWED_FOR_ACTOR` | The state machine rejects the status change                           |
| 500    | `INTERNAL_ERROR`                                          | Unexpected error; the details are only in the logs                    |

### Temporary dev authentication

> [!WARNING]
> This is a stopgap until real authentication lands ([1.5]). Don't build on it.

With `DEV_AUTH_ENABLED=true`, protected routes take the actor from the `X-Dev-Actor` header: `customer:<uuid>` or `agent:<uuid>`. With the flag off (the default), they return `401`. The API refuses to start if the flag is on and `NODE_ENV=production`.

```sh
curl -H 'X-Dev-Actor: agent:5eed0000-0000-4000-8000-0000000000a1' 'http://localhost:3000/incidents?status=open'
```

The [seeded actors](#seeded-actors) are ready to use.

The header only identifies the actor. Customers only see their own incidents and orders, but the "who" column above isn't enforced yet.

### OpenAPI

Outside production, the API serves Swagger UI at [`/docs`](http://localhost:3000/docs) and the OpenAPI 3.1 document at `/docs/json`. Both are generated from the `@csl/contracts` schemas with [`zod-openapi`](https://github.com/samchungy/zod-openapi).

## Tests

```sh
pnpm --filter ./apps/api run test
```

Unit tests (`src/**/*.spec.ts`) don't need a database. End-to-end tests (`test/**/*.e2e-spec.ts`) need a running PostgreSQL with migrations applied, at `DATABASE_URL` or at the default from `.env.example`. They empty the tables before each test, so don't point them at a database you care about. They run one file at a time and turn on `DEV_AUTH_ENABLED` themselves.

[1.5]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
