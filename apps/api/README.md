# `@csl/api`

NestJS API. It is the only part of the platform that talks to the database and to Vonage. See the [architecture overview](../../docs/architecture/README.md).

## Configuration

Copy `.env.example` to `.env` and adjust the values. `DATABASE_URL` is required: the API refuses to start if it is missing or is not a `postgres://` or `postgresql://` URL. The Vonage variables are explained in [Vonage](#vonage).

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

## Vonage

All calls to Vonage go through `VonageService` (`src/vonage/`). It wraps [`@vonage/server-sdk`](https://github.com/Vonage/vonage-node-sdk) behind small methods that only use our own types: `sendSms`, `createCall`, `transferCall`, `startVerification` and `checkVerification`. Inject it with its token:

```ts
constructor(@Inject(VONAGE_SERVICE) private readonly vonage: VonageService) {}
```

Import `VonageModule` in the module that needs it. Why Vonage, and how each API is used, are in [ADR 0003](../../docs/adr/0003-vonage-as-communications-provider.md) and [`docs/architecture/vonage.md`](../../docs/architecture/vonage.md).

### Enabling and disabling Vonage

Vonage is enabled by default. While it is enabled, the API refuses to start unless every variable below is set and valid, and the error lists the ones that are missing.

It is disabled when `VONAGE_ENABLED=false` or `NODE_ENV=test`. Then no variable is required and every `VonageService` method fails with `VonageDisabledError` without calling Vonage. `.env.example` disables it, so the API starts locally without a Vonage account. Variables that are set are still validated while Vonage is disabled.

| Variable                  | What it is                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `VONAGE_ENABLED`          | `true` (default) or `false`                                                                   |
| `VONAGE_API_KEY`          | API key, on the dashboard home page                                                           |
| `VONAGE_API_SECRET`       | API secret, next to the key                                                                   |
| `VONAGE_APPLICATION_ID`   | Id of the Vonage Application, used by Voice and Verify v2                                     |
| `VONAGE_PRIVATE_KEY`      | Content of the application's private key (PEM). Line breaks can be written as `\n`            |
| `VONAGE_VIRTUAL_NUMBER`   | The number we send SMS and call from, in E.164 (`+34600000000`)                               |
| `VONAGE_SIGNATURE_SECRET` | Secret that signs the webhooks Vonage sends us ([#30])                                        |
| `PUBLIC_URL`              | Public HTTPS URL of the API, which Vonage calls for webhooks. A tunnel such as ngrok in local |

### Setting up a Vonage account for development

1. Create an account in the [Vonage API dashboard](https://dashboard.nexmo.com). The API key and secret are on the home page.
2. Start a tunnel to the API and copy its HTTPS URL into `PUBLIC_URL`:

   ```sh
   ngrok http 3000
   ```

   A free ngrok URL changes every time you start it, so update `PUBLIC_URL` and the URLs below when it does.

3. In **API Settings**:
   - Set **Default SMS Setting** to **SMS API**. We use the SMS API, not the Messages API, and this decides the format of the SMS webhooks.
   - Set **Delivery receipts** to `<PUBLIC_URL>/webhooks/sms/status` and **Inbound messages** to `<PUBLIC_URL>/webhooks/sms/inbound`.
   - Copy the **Signature secret** into `VONAGE_SIGNATURE_SECRET`.

4. In **Applications**, create an application:
   - Click **Generate public and private key**. The browser downloads `private.key`; keep it out of the repository (`*.key` is ignored).
   - Turn on **Voice**, with the answer URL `<PUBLIC_URL>/webhooks/voice/answer` and the event URL `<PUBLIC_URL>/webhooks/voice/event`.
   - Save it and copy its id into `VONAGE_APPLICATION_ID`. Verify v2 needs no extra capability.

5. Put the private key into `VONAGE_PRIVATE_KEY` on one line:

   ```sh
   awk 'NF { sub(/\r/, ""); printf "%s\\n", $0 }' private.key
   ```

   Paste the output between double quotes: `VONAGE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`.

6. In **Numbers**, buy a number with SMS and Voice, link it to the application and copy it into `VONAGE_VIRTUAL_NUMBER` with the leading `+`.
7. While the account is on the free trial, Vonage only sends SMS and calls to the numbers listed in **Test numbers**. Add yours there.
8. Set `VONAGE_ENABLED=true` and start the API.

The webhook paths come from [#30] and can still change, but they stay under `/webhooks/*`.

### Sending a test SMS

With real credentials in `.env`, this sends one SMS from the virtual number. It runs the compiled script, so build the API first:

```sh
pnpm exec turbo run build --filter=@csl/api
pnpm --filter ./apps/api run vonage:send-test-sms +34600000000 'Optional text'
```

It prints the message id, and the SMS arrives within a few seconds. It refuses to run when `NODE_ENV=production` or while Vonage is disabled. If Vonage rejects the message, the error says why, for example `Vonage rejected "sendSms" (Non-Whitelisted Destination)` when the number isn't in **Test numbers**.

### Errors, timeouts and logs

| Error                 | When                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `VonageRequestError`  | Vonage rejected the request, or it failed to arrive. `status` and `reason` say why, if known |
| `VonageTimeoutError`  | Vonage didn't answer within 10 seconds                                                       |
| `VonageDisabledError` | Vonage is disabled                                                                           |

All of them extend `VonageError` and carry the `operation`. A wrong Verify code isn't an error: `checkVerification` returns `{ verified: false }`.

- **Timeouts:** every request to Vonage is aborted after 10 seconds (`VONAGE_TIMEOUT_MS`).
- **No retries:** sending an SMS, starting a call or a verification isn't idempotent, so retrying after a timeout could send it twice. Retries that the flows need, such as calling the driver again, are decided by those flows.
- **Logs:** each call logs its operation and result, with the phone number masked (`+34******009`). The SMS text, credentials and the SDK's own error are never logged; the SDK error holds the whole request, authentication headers included.

> [!WARNING]
> Don't set `DEBUG=vonage:*`. It turns on the SDK's own logging, which prints every request with its credentials.

### Vonage in tests

Unit tests build `SdkVonageService` with a stub client (see `sdk-vonage.service.spec.ts`). End-to-end tests run with `NODE_ENV=test`, and `createTestApp()` replaces `VONAGE_SERVICE` with a `FakeVonageService` (`test/fixtures/fake-vonage.service.ts`) that records every call. The fake accepts the verification code `1234`.

```ts
const { app, vonage } = await createTestApp();
// ...
expect(vonage.callsTo('sendSms')).toEqual([
  { operation: 'sendSms', to: '+34611000009', text: '...' },
]);
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
curl -H 'X-Dev-Actor: agent:5eed0000-0000-4000-8000-0000000000a1' 'http://localhost:3000/incidents?status=open'
```

The [seeded actors](#seeded-actors) are ready to use.

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

Unit tests (`src/**/*.spec.ts`) don't need a database. End-to-end tests (`test/**/*.e2e-spec.ts`) need a running PostgreSQL with migrations applied, at `DATABASE_URL` or at the default from `.env.example`. They empty the tables before each test, so don't point them at a database you care about. They run one file at a time and set `DEV_AUTH_ENABLED`, `PUBLIC_URL` and the Vonage webhook variables themselves (see `vitest.config.ts`); `VonageService` is replaced by `FakeVonageService`, so nothing reaches Vonage.

[#30]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/30
[1.5]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
