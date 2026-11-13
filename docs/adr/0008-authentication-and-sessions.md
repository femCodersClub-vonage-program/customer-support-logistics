# 0008. Authentication and sessions

- **Status:** accepted
- **Date:** 2026-11-11

## Context

The API has two kinds of users, and each one proves who they are in a different way ([#31][i31]):

- **Customers** use the PWA and are identified by their phone number (`customers.phone`, `customers.phone_verified_at`). [ADR 0003](0003-vonage-as-communications-provider.md) chose Verify v2 for this: `silent_auth` first, then `sms` as fallback.
- **Agents** use the CRM. There is no `agents` table yet: `incidents.agent_id` is a `uuid` without a foreign key, waiting for this decision ([ADR 0005](0005-orm-and-migrations.md)).
- **Drivers** never log in.

Until now, the orders and incidents routes accept a temporary `x-dev-actor` header (`DevActorGuard`), allowed only when `DEV_AUTH_ENABLED=true` and never in production.

These constraints shape the decision:

- Both frontends call the API through `/api` on their own origin (the Vite proxy in the client, rewrites in the CRM), so for the browser the API is same-origin. CRM server components call the API directly at `API_URL`.
- Issue #31 asks that tokens are not readable from JavaScript and that logout invalidates the session.
- Silent authentication has changed since ADR 0003. The `sandbox` parameter is deprecated: Vonage answers `422` since 1 May 2026. Live silent auth needs the Vonage account to pass the **Network Registry**, with its profile approved by the carriers (in Spain: Telefónica, Orange and Vodafone); without that approval, Verify answers `412`. For testing, the Network Registry Playground allows up to 5 registered numbers and needs its own Vonage Application.
- Every verification SMS has a cost, so the login must not send SMS to any number someone types.

## Options considered

### Opaque session id in a cookie, stored in PostgreSQL

A random token in an `HttpOnly` cookie. The API keeps a hash of it in a `sessions` table.

- **Pros:** logout and revocation delete one row. JavaScript can't read the token. It uses the database we already have, with no keys to sign or rotate.
- **Cons:** one indexed query per request. Cookies need protection against CSRF.

### JWT access token and refresh token, in cookies

- **Pros:** the access token is checked without the database. A widespread pattern.
- **Cons:** logout doesn't invalidate an access token until it expires, unless we keep a deny list, which brings the database query back. Refresh rotation, reuse detection and signing keys are extra code to maintain.

### JWT in `localStorage`, sent as `Authorization: Bearer`

This is what `@csl/api-client` anticipates with its `getToken` option.

- **Pros:** no CSRF, and simple to send.
- **Cons:** any XSS can read the token, so it doesn't meet the #31 criterion.

### An auth library (Passport in NestJS, Auth.js in the CRM)

- **Pros:** known patterns and ready-made strategies.
- **Cons:** what we need is one guard, one table and two login flows. Passport adds a strategy layer around that, and Auth.js would bring a second session system into the CRM, next to the API's, with two places to keep in sync.

## Decision

We use an **opaque session id in an `HttpOnly` cookie, stored in PostgreSQL**, written in `apps/api` without an auth library. It meets both criteria from #31 with the least code, and it fits the same-origin `/api` setup we already have.

### Sessions

- `sessions` table: `token_hash` (SHA-256 of the token, so a copy of the database doesn't expose live sessions), `customer_id` or `agent_id` (exactly one, checked with a `CHECK`), `expires_at` and `created_at`.
- Token: 32 random bytes from `node:crypto`, encoded as base64url.
- Cookie `csl_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and no `Domain`, so it stays on the host that set it.
- Lifetime, fixed from login: 30 days for customers, 12 hours for agents. Logging a customer in again costs an SMS, which is why their session is longer. Both values can be tuned in the implementation.
- `POST /auth/logout` deletes the row and clears the cookie. `GET /auth/me` returns the current user to the frontends.
- CSRF: with `SameSite=Lax` the browser doesn't send the cookie on cross-site `POST`, `PATCH` or `DELETE`, and no `GET` endpoint changes state.

### Customer login with Verify v2

1. `POST /auth/customer/start` receives the phone in E.164. **Only existing customers can log in.** The API doesn't create customers at login: customers come with their orders, and a new one would have nothing to see.
2. For a known customer, the API starts a Verify request in the customer's `locale`, with the workflow `silent_auth` (whose `redirect_url` points to the PWA) and then `sms`. It keeps the `request_id` in a short-lived `HttpOnly` cookie and returns the `check_url`. Vonage recommends this: the `request_id` that comes back from the redirect must match the cookie.
3. If Verify answers `412` (silent auth not available for the account or the carrier), the API starts a new request with `sms` only, and the PWA goes straight to the code.
4. Silent auth: the PWA navigates to the `check_url` over mobile data, and Vonage redirects back to the PWA with `request_id` and `code` in the URL fragment. On Wi-Fi or with an unsupported carrier, Verify moves on to the SMS by itself. The client side is built in [#33][i33] and checked there on a real phone.
5. `POST /auth/customer/check` receives the code, from silent auth or from the SMS. If Verify accepts it, the API creates the session and sets `phone_verified_at`.
6. An unknown number gets the SMS-only answer without calling Vonage, and its check always fails as a wrong code. While silent auth is on, this tells a known number from an unknown one. We accept that: knowing that a number belongs to a customer reveals little, and the rate limits slow down anyone trying numbers in bulk.

To show Vonage working with real phones, `db:seed` accepts an optional `SEED_CUSTOMER_PHONES` with two or three team phones. They replace the phones of the seeded customers, who already have orders and incidents to show. Each person puts only their own number in their local `.env`, so no real number is committed or shared. Seeding again without the variable closes that access.

### Agent login

- `agents` table: `id`, `email` (unique), `name`, `role` (only `agent` for now), `locale`, `password_hash`, `created_at` and `updated_at`. `incidents.agent_id` gets its foreign key.
- `POST /auth/agent/login` with email and password. Passwords are hashed with `scrypt` from `node:crypto`, which avoids the native dependency that argon2 needs. The parameters are stored next to the hash, so they can be raised later without breaking existing passwords. A wrong email and a wrong password get the same error.
- There is no public sign-up. An `agent:create` command creates an agent and prints a generated password once.
- Magic links would need an email provider that the project doesn't have, so they stay out, together with password reset ([#31][i31] leaves it out of scope).

### Guards

- `AuthGuard` is global (`APP_GUARD`): every route needs a session unless it is marked `@Public()`. `/health`, `/webhooks/*` (checked by signature, [#30][i30]), `POST /auth/agent/login` and `POST /auth/logout` are public; `GET /auth/me` needs a session. A new route is protected from the start.
- The guard turns the cookie into `{ role: 'customer' | 'agent', id }`, the same shape `DevActor` has today, so the services keep working as they are.
- `@Roles('customer')` and `@Roles('agent')` on each endpoint. No session gives `401`, and the wrong role gives `403`.
- Ownership stays in the services: a customer who asks for another customer's incident gets `404`, as today.
- `DevActorGuard`, the `x-dev-actor` header and `DEV_AUTH_ENABLED` are removed once the CRM has its login page ([#31][i31]). Until then, with `DEV_AUTH_ENABLED=true`, the guard still accepts the header when there is no session, so the CRM keeps working.

### Rate limiting

With `@nestjs/throttler`, which the webhooks already use, in memory:

- `start`: per phone and per IP.
- `check`: per IP. Verify limits the wrong codes for each request on its side (to be confirmed, see below).
- Agent login: per IP.

When Verify blocks a number, the customer gets a message that tells them to wait, not a generic error. The exact limits are set in the implementation.

### Silent authentication availability

The login works whether the Vonage account has silent auth or not: without carrier approval, every login uses the SMS code (step 3). Turning silent auth on is a task in the Vonage account (the Network Registry, or a Playground application for up to 5 test numbers). It doesn't change the code, except for which Vonage Application the Verify calls use if the Playground needs its own. That is decided with whoever manages the account.

### Local development

`x-dev-actor` is how the team works locally today, without a Vonage account. Its replacement keeps that possible through the real login:

- `DEV_VERIFY_CODE`: when it is set and Vonage is disabled, Verify is replaced by a stub that accepts that code, and the API logs a warning at startup. The API refuses to start with it in production, as it does today with `DEV_AUTH_ENABLED`.
- `SEED_AGENT_PASSWORD`: when it is set, `db:seed` gives that password to the seeded agents, so the CRM can be used right after seeding.
- Both go in `apps/api/.env.example`, and the API README explains how to log in locally as a customer and as an agent.

### To be confirmed

These points come from Vonage's documentation or from browser behaviour, and are checked during the implementation:

- That Verify limits the wrong codes for each request on its side. If it doesn't, `check` also gets a limit per verification.
- The number of test phones in the Network Registry Playground (5 at the time of writing), and whether a Playground application can also send SMS and make calls.
- How the PWA comes back when silent auth fails, and that navigating to the `check_url` is enough. [#33][i33] checks it on a real phone.
- That browsers accept the `Secure` cookie on `http://localhost` (Chrome and Firefox do; Safari is unconfirmed).

## Consequences

- The PWA and the CRM call `/api` with the cookie, so `@csl/api-client` sends no token from the browser. CRM server-side calls forward the incoming `Cookie` header instead of `x-dev-actor`.
- In the CRM, the Next.js 16 `proxy.ts` (formerly `middleware`) sends visitors without a session cookie to `/login`. The API still checks every request.
- e2e tests create sessions directly in the database with a helper, and the tests that use `x-dev-actor` move to it.
- A new environment variable holds the public URL of the PWA, for the silent auth `redirect_url`. If the Playground needs its own Vonage Application, Verify gets its own application id and private key.
- In development, cookies are not separated by port: the client and the CRM on `localhost` share `csl_session`. To be logged in as a customer and as an agent at the same time (for example, to test a mediation), open one of the apps on `127.0.0.1`.
- Rate limits live in each instance's memory, as for the webhooks: with more than one instance they move to Redis, and Express `trust proxy` must be set when the hosting is decided.
- The `sessions` table stores ids and hashes, not phone numbers. Auth events are logged as structured JSON without phones or emails (`maskPhone`), and expected failures (wrong code, blocked number, wrong password) are logged apart from system errors (Vonage or the database unavailable).
- We would revisit this decision if the query per request became a bottleneck (sessions cached in Redis) or if agents needed single sign-on.

[i30]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/30
[i31]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
[i33]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/33
