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

`db:generate` loads the schema, which imports `@csl/shared-types`, so build it first if you haven't: `pnpm exec turbo run build --filter=@csl/shared-types`. The `db:*` scripts read `apps/api/.env` if it exists.

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
| 401    | `UNAUTHORIZED`                                            | Bad `X-Dev-Actor` header, dev auth off, or bad Vonage signature       |
| 403    | `FORBIDDEN`                                               | The actor can't use the route, such as an agent calling `GET /orders` |
| 404    | `NOT_FOUND`                                               | Missing resource, or one that belongs to another customer             |
| 409    | `INVALID_TRANSITION` / `TRANSITION_NOT_ALLOWED_FOR_ACTOR` | The state machine rejects the status change                           |
| 429    | `RATE_LIMITED`                                            | Too many requests to `/webhooks/*` (`WEBHOOK_RATE_LIMIT_PER_MINUTE`)  |
| 500    | `INTERNAL_ERROR`                                          | Unexpected error; the details are only in the logs                    |

### Temporary dev authentication

> [!WARNING]
> This is a stopgap until real authentication lands ([1.5]). Don't build on it.

With `DEV_AUTH_ENABLED=true`, protected routes take the actor from the `X-Dev-Actor` header: `customer:<uuid>` or `agent:<uuid>`. With the flag off (the default), they return `401`. The API refuses to start if the flag is on and `NODE_ENV=production`.

```sh
curl -H 'X-Dev-Actor: agent:00000000-0000-4000-8000-0000000000a1' 'http://localhost:3000/incidents?status=open'
```

The header only identifies the actor. Customers only see their own incidents and orders, but the "who" column above isn't enforced yet.

### Vonage webhooks

Vonage calls the routes under `/webhooks/*`. They don't use `X-Dev-Actor`; they check Vonage's signature with `VONAGE_SIGNATURE_SECRET` instead, and reject everything if it isn't set. What each route does, how to point a Vonage application to a local tunnel and how to test with a real phone are in [Vonage integration](../../docs/architecture/vonage.md#webhooks).

To replay a sample payload against the local API without a phone, sign it with the secret from `.env`:

```sh
node --env-file=.env scripts/replay-vonage-webhook.mjs messages-inbound-sms text=2
node --env-file=.env scripts/replay-vonage-webhook.mjs voice-input-dtmf incident=<incident-id>
```

The payloads are in `test/fixtures/vonage/`, and the e2e tests use the same files.

### OpenAPI

Outside production, the API serves Swagger UI at [`/docs`](http://localhost:3000/docs) and the OpenAPI 3.1 document at `/docs/json`. Both are generated from the `@csl/contracts` schemas with [`zod-openapi`](https://github.com/samchungy/zod-openapi).

## Tests

```sh
pnpm --filter ./apps/api run test
```

Unit tests (`src/**/*.spec.ts`) don't need a database. End-to-end tests (`test/**/*.e2e-spec.ts`) need a running PostgreSQL with migrations applied, at `DATABASE_URL` or at the default from `.env.example`. They empty the tables before each test, so don't point them at a database you care about. They run one file at a time and set `DEV_AUTH_ENABLED`, `PUBLIC_URL` and the Vonage webhook variables themselves (see `vitest.config.ts`); the SMS sender is replaced by `FakeSmsSender`, so nothing reaches Vonage.

[1.5]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
