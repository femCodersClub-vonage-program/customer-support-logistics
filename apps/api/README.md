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

## Tests

```sh
pnpm --filter ./apps/api run test
```

Unit tests (`src/**/*.spec.ts`) don't need a database. End-to-end tests (`test/**/*.e2e-spec.ts`) need a running PostgreSQL with migrations applied, at `DATABASE_URL` or at the default from `.env.example`.
