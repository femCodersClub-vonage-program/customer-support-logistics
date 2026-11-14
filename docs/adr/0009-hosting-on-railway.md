# 0009. Hosting on Railway

- **Status:** proposed
- **Date:** 2026-11-12

## Context

Hosting was the last open decision in the ADR index ("Hosting and preview deployments"), and everything still ran locally ([#57][i57]). Three things need public HTTPS URLs that don't change:

- **Vonage webhooks.** Vonage calls `PUBLIC_URL/webhooks/*`. With ngrok, that URL changes on every restart, and the Vonage Application has to be updated each time ([ADR 0003](0003-vonage-as-communications-provider.md)).
- **Silent authentication.** Verify redirects the browser back to a fixed URL of the PWA ([ADR 0008](0008-authentication-and-sessions.md)).
- **Real phones.** The PWA has to be installable and testable on a phone, which needs HTTPS.

What we deploy:

- `apps/api`: NestJS, already with a `Dockerfile` built from a pruned workspace, and migrations that run as a separate step, never on boot ([ADR 0005](0005-orm-and-migrations.md)).
- `apps/client`: a Vite PWA, built to static files. In development, Vite's proxy sends `/api/*` to the API, and ADR 0008 relies on that same-origin `/api` for the session cookie. That proxy doesn't exist in a static build.
- `apps/crm`: Next.js. Its rewrites send `/api/*` to the API in production too.
- PostgreSQL.

The team is small and has no one dedicated to operations, so a platform that runs containers and a managed PostgreSQL from one place keeps the work low.

## Options considered

### Railway

- **Pros:** Dockerfiles, managed PostgreSQL and a private network between services in one project. HTTPS domains out of the box. A pre-deploy command runs migrations before each new version starts. Usage-based pricing that fits a project of this size.
- **Cons:** one provider for compute and database. Service settings live in Railway, not in the repository (see the decision).

### Vercel for the frontends, and a separate host for the API and the database

- **Pros:** Vercel is very good at Next.js and static sites, with preview deployments per pull request.
- **Cons:** two or three providers, two places for environment variables, and `/api` crossing domains. Cookies across domains would need `SameSite=None` and CORS, which works against ADR 0008.

### Fly.io or Render

- **Pros:** also run containers with managed PostgreSQL.
- **Cons:** no clear advantage over Railway here. The team already has Railway access.

## Decision

We host the three apps and PostgreSQL in one **Railway** project, deployed from **`develop`**, with one environment (`production`) and no preview deployments for now.

| Service    | Built from                    | Notes                                                                                                                    |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Postgres` | Railway's PostgreSQL template | Private address only; `DATABASE_URL` is a reference variable                                                             |
| `api`      | `apps/api/Dockerfile`         | Migrations as the pre-deploy command, health check on `/health`                                                          |
| `client`   | `apps/client/Dockerfile`      | Caddy serves the static build, falls back to `index.html`, and forwards `/api/*` to the API over the private network     |
| `crm`      | `apps/crm/Dockerfile`         | `next start`; `API_URL` points to the API's private address, at build time (rewrites) and at runtime (server components) |

- **Service settings live in Railway and are documented in the repository.** Railway's `railway.json` files are deprecated (Railway's own deploy logs say so and point to [migrating from config as code](https://docs.railway.com/infrastructure-as-code#migrating-from-config-as-code)) and weren't applied when we tried them. Their replacement, `.railway/railway.ts`, needs Railway's npm package as a new dependency. For four services that change rarely, we keep the settings in Railway and list every one of them in `docs/architecture/deployment.md`, so they can be rebuilt by hand.
- **Same origin for `/api`.** The client and the CRM forward `/api/*` to the API, so the browser sees the API on the same origin and the session cookie of ADR 0008 works without CORS.
- **The client IP comes from `X-Real-IP`.** Railway's edge proxy puts the client's IP in `X-Real-IP`, [not in `X-Forwarded-For`](https://docs.railway.com/networking/public-networking/specs-and-limits). Behind it, the socket address is an internal proxy address that changes between requests, so per-IP rate limits never trigger: we checked it on the deployed API, where 140 requests in 15 seconds didn't reach the limit of 120 per minute. With `CLIENT_IP_HEADER=x-real-ip`, the API takes the client IP from that header. Caddy forwards it unchanged, so requests that come through the client keep the client's IP too.
- **Secrets** live in Railway's variables, never in the repository.

## Consequences

- A merge to `develop` deploys. `main` stays as it is until the team decides how releases work.
- The deployed API runs with `NODE_ENV=production`, so `DEV_AUTH_ENABLED` can't be on. Until the CRM has its login page ([#31][i31]), the deployed CRM can't load data. The client is in the same situation until its login ([#33][i33]).
- The deployment uses the team's existing Vonage Application, the same one as development, which is enough for a pilot. Once its webhooks point at the deployed API, they no longer reach a local ngrok tunnel. Turning Vonage on is still pending in [#57][i57].
- `CLIENT_IP_HEADER` must only be set where a proxy that overwrites the header sits in front of the API. Without one, a client could send any IP in it and dodge the rate limits.
- The CRM image carries the whole pruned workspace. Next.js `output: 'standalone'` would make it smaller; it isn't needed yet.
- A setting changed in Railway without updating `deployment.md` leaves the two out of step. If that becomes a problem, `.railway/railway.ts` is the way to keep the settings in code.
- We would revisit this if we need preview deployments per pull request, more than one API instance (rate limits move to Redis), or a provider closer to the program's requirements.

[i31]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
[i33]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/33
[i57]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/57
