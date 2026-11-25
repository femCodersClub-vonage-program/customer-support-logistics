# `@csl/api`

NestJS API. It is the only part of the platform that talks to the database and to Vonage. See the [architecture overview](../../docs/architecture/README.md).

## Configuration

Copy `.env.example` to `.env` and adjust the values. `DATABASE_URL` is required: the API refuses to start if it is missing or is not a `postgres://` or `postgresql://` URL. The Vonage variables are explained in [Vonage](#vonage).

Background jobs run on pg-boss in the same database ([ADR 0013](../../docs/adr/0013-background-jobs-with-pg-boss.md)), so they need no extra service. `JOBS_POLLING_INTERVAL_SECONDS` sets how often workers look for jobs, and `MEDIATION_CALL_DELAY_SECONDS` and `MEDIATION_RETRY_DELAY_SECONDS` the time before the driver's mediation call and between its retries. `CLIENT_PUBLIC_URL` is the PWA address used in the mediation invite SMS.

`CLIENT_IP_HEADER` names the header the API takes the client IP from, for the rate limits. Leave it unset locally: anyone could send that header. Behind Railway it is `x-real-ip`; the reason, and every variable of the deployment, are in [Deployment](../../docs/architecture/deployment.md).

Any PostgreSQL 17 works. The easiest way is the one in the root `docker-compose.yml`:

```sh
docker compose up -d postgres
```

## Evidence upload lifecycle

Evidence records are created as `pending` before the browser uploads directly with a presigned URL. A pending record that is older than `EVIDENCE_PENDING_TTL_SECONDS` (one hour by default) is removed, together with its object, when the customer requests another upload URL for that incident. This returns abandoned upload slots to the incident quota; ready evidence is never removed by this mechanism.

Upload URLs are signed for the declared content length. Completion copies the uploaded object to a separate key, validates that copy and serves only the copy. Temporary keys use the `evidence-pending/` prefix. Local Compose installs a one-day expiration rule and starts the SeaweedFS administrator and lifecycle worker. Production storage must be configured separately with an equivalent lifecycle rule and an operational lifecycle worker. The pending TTL must exceed the signed URL lifetime by at least one minute and cannot exceed 12 hours, leaving a safety margin before storage lifecycle expiration. Lifecycle processing is asynchronous, so deletion is not immediate.

### Orphaned evidence maintenance

After building the API, run `pnpm --filter @csl/api evidence:reconcile` with the target environment configured. Run this command periodically through the deployment's maintenance scheduler, or manually after an unknown completion outcome is logged. It scans `incidents/` with paginated storage listings and deletes final objects without a `ready` evidence reference. Temporary uploads remain covered by their separate lifecycle rule. The command uses a standalone application context; it does not start the HTTP server or mediation workers.

Reconciliation skips objects that already have a `ready` reference without locking the incident. For the remaining candidates, it locks the incident and checks the reference again before deleting. Completion holds the same lock from before copying through the database commit, so reconciliation waits for in-flight completions before deciding whether a copy is orphaned. Failures stop the sweep and can be retried. Unexpected key formats, including uppercase variants, are skipped.

`STORAGE_PUBLIC_ENDPOINT` optionally selects the HTTPS storage endpoint used to sign browser PUT and GET URLs. Internal HEAD, reads, copies, listings and deletes continue through `STORAGE_ENDPOINT`. Without the public endpoint, signing also uses the internal endpoint. Configure both to reach the same bucket, and preserve signed host/path/query when proxying public requests.

When a public endpoint is configured, `STORAGE_PUBLIC_FORCE_PATH_STYLE` can override its addressing style. Use `true` for `storage.example.com/evidence/...` or `false` for `evidence.storage.example.com/...`. When unset or empty, signing inherits `STORAGE_FORCE_PATH_STYLE`.

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
- Because existing rows are never updated, changes to the demo data in `src/database/seed-data.ts` don't reach a database that is already seeded. Recreate the database to start over. There are two exceptions:
  - `SEED_AGENT_PASSWORD` (12 characters or more): when it is set, the seeded agents get that password even if they already exist, each with its own salt.
  - `SEED_CUSTOMER_PHONES`: a comma-separated list of E.164 phones that replace, in order, the phones of the seeded customers, so you can log in with Verify on a real phone. Put only your own number, and only in your local `.env`. Seeding again without it gives the customers back their demo phones.
- The e2e tests never touch this database: they only run against one whose name ends in `_test` (see [Tests](#tests)).

The data is in `src/database/seed-data.ts`, and `seed-data.spec.ts` checks that every incident's event history is a valid path through the state machine.

#### Seeded actors

Customers log in with their phone ([as a customer](#logging-in-locally-as-a-customer)) and agents with their email and `SEED_AGENT_PASSWORD` ([as an agent](#logging-in-locally-as-an-agent)).

| Who                     | Logs in with               | Locale | What they have                                                              |
| ----------------------- | -------------------------- | ------ | --------------------------------------------------------------------------- |
| Lucía Martín, customer  | `+34611000001`             | `es`   | An `open` incident on a failed order, an `escalated` one on a pending order |
| Carlos Romero, customer | `+34611000002`             | `es`   | Incidents in `notified`, `escalated` and `resolved`                         |
| Emma Wilson, customer   | `+447700900001`            | `en`   | Two incidents `in_mediation`                                                |
| James Taylor, customer  | `+447700900002`            | `en`   | A `resolved` incident and a pending order without incidents                 |
| Marta Vidal, agent      | `marta.vidal@example.com`  | `es`   | Assigned to one `in_mediation` and one `resolved` incident                  |
| Olivia Brown, agent     | `olivia.brown@example.com` | `en`   | Assigned to one `escalated` and one `resolved` incident                     |

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

- **Railway:** the same command is the service's pre-deploy command, so migrations run before each new version starts. The previous version keeps serving while they run, so a migration must not break it: add first, remove in a later deploy.

### Deployment

The API runs on Railway from `apps/api/Dockerfile`. Its settings and variables are in [Deployment](../../docs/architecture/deployment.md#api).

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
   - Set **Default SMS Setting** to **Messages API**. We send and receive SMS with the Messages API, and this decides the format of the SMS webhooks.
   - Copy the **Signature secret** into `VONAGE_SIGNATURE_SECRET`.

4. In **Applications**, create an application:
   - Click **Generate public and private key**. The browser downloads `private.key`; keep it out of the repository (`*.key` is ignored).
   - Turn on **Voice**, with the answer URL `<PUBLIC_URL>/webhooks/voice/answer` and the event URL `<PUBLIC_URL>/webhooks/voice/event`.
   - Turn on **Messages**, with the inbound URL `<PUBLIC_URL>/webhooks/sms/inbound` and the status URL `<PUBLIC_URL>/webhooks/sms/status`.
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

All of them extend `VonageError` and carry the `operation`. The expected Verify answers aren't errors: `startVerification` returns `{ status: 'blocked' }` when Verify answers `409` (a verification for that number is still running) or `429`, and `checkVerification` returns `wrong_code` (`400`), `expired` (`404`), `too_many_attempts` (`410`) or `blocked` (`429`).

- **Timeouts:** every request to Vonage is aborted after 10 seconds (`VONAGE_TIMEOUT_MS`).
- **No retries:** sending an SMS, starting a call or a verification isn't idempotent, so retrying after a timeout could send it twice. Retries that the flows need, such as calling the driver again, are decided by those flows.
- **Logs:** each call logs its operation and result, with the phone number masked (`+34******009`). The SMS text, credentials and the SDK's own error are never logged; the SDK error holds the whole request, authentication headers included.

> [!WARNING]
> Don't set `DEBUG=vonage:*`. It turns on the SDK's own logging, which prints every request with its credentials.

### Vonage in tests

Unit tests build `SdkVonageService` with a stub client (see `sdk-vonage.service.spec.ts`). End-to-end tests run with `NODE_ENV=test`, and `createTestApp()` replaces `VONAGE_SERVICE` with a `FakeVonageService` (`test/fixtures/fake-vonage.service.ts`) that records every call. The fake accepts the verification code `1234`; `blockNextStart()` and `answerNextCheck(outcome)` simulate the other Verify answers.

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

| Method  | Path                                   | Who                    | What                                                                                   |
| ------- | -------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| `POST`  | `/auth/agent/login`                    | anyone                 | Log an agent in and set the session cookie                                             |
| `POST`  | `/auth/customer/start`                 | anyone                 | Start a customer login, by silent authentication or SMS                                |
| `POST`  | `/auth/customer/sms`                   | anyone                 | Send the SMS now, when silent authentication failed                                    |
| `POST`  | `/auth/customer/check`                 | anyone                 | Log a customer in with that code and set the session cookie                            |
| `POST`  | `/auth/logout`                         | anyone                 | End the session and clear the cookie                                                   |
| `GET`   | `/auth/me`                             | customer / agent       | The person behind the current session                                                  |
| `POST`  | `/incidents`                           | customer               | Create an incident for one of their orders                                             |
| `GET`   | `/incidents`                           | agent                  | CRM inbox, filtered and paginated                                                      |
| `GET`   | `/incidents/:id`                       | customer (own) / agent | Detail with order, customer, driver, events and communications                         |
| `PATCH` | `/incidents/:id/status`                | agent                  | Change the status through the state machine                                            |
| `POST`  | `/incidents/:id/mediation`             | agent                  | Start the mediation and call the driver ([details](../../docs/architecture/vonage.md)) |
| `POST`  | `/incidents/:id/mediation/driver-call` | agent                  | Call the driver again during the mediation                                             |
| `GET`   | `/orders`                              | customer               | The customer's orders                                                                  |

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

| Status | `code`                                                    | When                                                                                                                            |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED`                                       | Invalid body, query or path; `details` lists each offending field                                                               |
| 400    | `BAD_REQUEST`                                             | Malformed request, such as invalid JSON                                                                                         |
| 401    | `UNAUTHORIZED`                                            | No valid session, wrong email or password, or bad Vonage signature                                                              |
| 401    | `INVALID_CODE`                                            | Wrong login code; the customer can try again                                                                                    |
| 403    | `FORBIDDEN`                                               | The route is for another role, such as an agent calling `GET /orders`                                                           |
| 404    | `NOT_FOUND`                                               | Missing resource, or one that belongs to another customer                                                                       |
| 409    | `INVALID_TRANSITION` / `TRANSITION_NOT_ALLOWED_FOR_ACTOR` | The state machine rejects the status change                                                                                     |
| 410    | `VERIFICATION_EXPIRED` / `TOO_MANY_ATTEMPTS`              | The login code expired or was wrong too many times; the customer asks for a new one                                             |
| 429    | `RATE_LIMITED`                                            | Too many requests to `/webhooks/*` (`WEBHOOK_RATE_LIMIT_PER_MINUTE`) or to the login routes (see below), or Verify asks to wait |
| 500    | `INTERNAL_ERROR`                                          | Unexpected error; the details are only in the logs                                                                              |

### Authentication

How it works and why is in [ADR 0008](../../docs/adr/0008-authentication-and-sessions.md). In short:

- Every route needs a session unless it is marked `@Public()`: `/health`, `/webhooks/*`, and the login and logout routes under `/auth`. `GET /auth/me` needs a session. A new route is protected from the start.
- Rate limits, which answer `429`:
  - `POST /auth/agent/login`: 10 attempts per minute from the same IP.
  - `POST /auth/customer/start`: 10 attempts in 15 minutes from the same IP, and 10 for the same phone. Verify also refuses a new code while the previous one for that number is still valid.
  - `POST /auth/customer/check`: 10 attempts per minute from the same IP. Verify ends a request on the third wrong code.
- A new login also ends the session the browser already had, and expired sessions are deleted on each login.
- The session is an opaque token in the `csl_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`). The `sessions` table keeps only its SHA-256 hash. Agent sessions last 12 hours and customer sessions 30 days.
- `@Roles('customer')` or `@Roles('agent')` on a route enforces the "who" column above: no session gives `401`, the wrong role `403`. Services still check ownership, so another customer's incident is a `404`.
- With `SILENT_AUTH_REDIRECT_URL` set to the PWA's `/login/callback`, `POST /auth/customer/start` tries silent authentication first and answers `{ channel: 'silent_auth', checkUrl }`. The PWA navigates to `checkUrl` over mobile data and sends the `code` and `request_id` it gets back to `/auth/customer/check` (until the login moves to SMS, a code without that `request_id` is rejected); if that fails, `POST /auth/customer/sms` sends the SMS at once instead of after Verify's 60 seconds. When the carrier isn't supported (`412`), or the variable is unset, the login goes straight to SMS. How the PWA side works is in [silent authentication from the PWA](../../docs/architecture/silent-auth.md).
- Without silent authentication, customers log in with an SMS code. `POST /auth/customer/start` keeps the Verify request id in the `csl_verification` cookie (`HttpOnly`, 10 minutes, the same `channel_timeout` it asks Verify for), and `POST /auth/customer/check` only accepts a code for that request. Which customer each request belongs to is kept in the API's memory, so a restart in the middle of a login means asking for a new code. That memory has no size limit: unknown phones enter it without any Vonage cost, but the start rate limits bound how fast it grows and each entry goes after 10 minutes. With more than one instance it moves to Redis, like the rate limits. An unknown phone gets a `200` without any SMS, and every code for it is wrong; the third wrong code answers `410 TOO_MANY_ATTEMPTS`, as Verify does for a real one. Someone trying numbers can still tell known ones apart (by response time, or because only known numbers get `channel: 'silent_auth'`); ADR 0008 accepts that, and the rate limits slow it down.

#### Logging in locally as a customer

Without a Vonage account, set `DEV_VERIFY_CODE` (4 to 10 digits) in `.env`. With Vonage disabled, the API then accepts that code for any customer and sends no SMS. It refuses to start with `DEV_VERIFY_CODE` in production or with Vonage enabled.

```sh
curl -i -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"phone":"+34611000001"}' http://localhost:3000/auth/customer/start
curl -i -b cookies.txt -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"code":"<DEV_VERIFY_CODE>"}' http://localhost:3000/auth/customer/check
curl -b cookies.txt http://localhost:3000/orders
```

With Vonage enabled, put your own phone in `SEED_CUSTOMER_PHONES`, seed again, and use the code from the SMS.

#### Logging in locally as an agent

1. Put a password of 12 characters or more in `SEED_AGENT_PASSWORD` in `.env`, and run `db:seed`. Both seeded agents get it, also when they already exist.
2. Log in, and copy the `csl_session=…` value from the `Set-Cookie` header:

   ```sh
   curl -i -H 'Content-Type: application/json' \
     -d '{"email":"marta.vidal@example.com","password":"<SEED_AGENT_PASSWORD>"}' \
     http://localhost:3000/auth/agent/login
   ```

3. Send it on the next requests:

   ```sh
   curl -H 'Cookie: csl_session=<token>' 'http://localhost:3000/incidents?status=open'
   ```

#### Creating an agent

There is no public sign-up. `agent:create` adds an agent and prints a generated password once. It works in any environment, so it also creates the first agent of a new deployment:

```sh
pnpm exec turbo run build --filter=@csl/api
pnpm --filter ./apps/api run agent:create --email lucia@example.com --name "Lucía Pérez" --locale es
```

### Vonage webhooks

Vonage calls the routes under `/webhooks/*`. They don't use a session; they check Vonage's signature with `VONAGE_SIGNATURE_SECRET` instead, and reject everything if it isn't set. What each route does, how to point a Vonage application to a local tunnel and how to test with a real phone are in [Vonage integration](../../docs/architecture/vonage.md#webhooks).

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

Unit tests (`src/**/*.spec.ts`, and `test/setup/**/*.spec.ts` for the e2e guard) don't need a database. End-to-end tests (`test/**/*.e2e-spec.ts`) empty the tables before each test, so they only run against a database meant for them:

- `DATABASE_URL` must be set in the shell. The e2e tests don't use a default and ignore the one in `apps/api/.env`.
- The database name must end in `_test`. Otherwise they stop before connecting and say how to fix it. Vitest prints `No test files found` first; the reason is below it, under "Unhandled Error".

To run only the unit tests, add `--project unit`; they don't need `DATABASE_URL`.

### Test database

Create the test database once in the Docker Compose PostgreSQL, and migrate it whenever the schema changes. Use the port where your container listens (`POSTGRES_PORT`, 5432 by default):

```sh
docker compose exec postgres createdb -U app customer_support_logistics_test

DATABASE_URL=postgresql://app:dev_only_password@localhost:5432/customer_support_logistics_test pnpm --filter ./apps/api run db:migrate
DATABASE_URL=postgresql://app:dev_only_password@localhost:5432/customer_support_logistics_test pnpm --filter ./apps/api run test
```

A `DATABASE_URL` set in the shell takes precedence over `apps/api/.env`, both for `db:migrate` and for the tests. That is why the commands above set it only for themselves: if it stays set, `run dev` in the same terminal also uses the test database, and the next e2e run empties it. In PowerShell, use a separate terminal for the tests and set the variable there with `$env:DATABASE_URL='postgresql://…_test'`. CI creates `customer_support_logistics_test` in its PostgreSQL service and migrates it before the tests.

The e2e tests run one file at a time and set `PUBLIC_URL` and the Vonage webhook variables themselves (see `vitest.config.ts`); `VonageService` is replaced by `FakeVonageService`, so nothing reaches Vonage. To act as someone, a test creates a session with `sessionCookieFor` or `sessionCookiesFor` (`test/fixtures/auth.ts`) and sends it as the `Cookie` header.

Background jobs use the real pg-boss on the test database, but workers poll only once an hour (`JOBS_POLLING_INTERVAL_SECONDS=3600`), so nothing runs on its own. `runDueJobs(testApp)` (`test/fixtures/jobs.ts`) runs the jobs that are due, `advanceJobClock(testApp, seconds)` moves the pending jobs forward in time and runs them, and `pendingJobs(testApp)` lists what is scheduled and in how many seconds.

[#30]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/30
