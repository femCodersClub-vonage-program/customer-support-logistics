# Deployment

The API, the client and the CRM run on [Railway](https://railway.com), with PostgreSQL, in one project called `customer-support-logistics`. Why Railway and how it fits is in [ADR 0009](../adr/0009-hosting-on-railway.md).

Service settings live in Railway, not in the repository. This page lists every one of them, so the project can be checked or rebuilt by hand. **When you change a setting in Railway, update this page in the same pull request or right after.**

## Environment

One environment, `production`. Until the pull request of [#57] is merged, the services are deployed with `railway up` from that branch. After the merge, each app service is connected to the GitHub repository, branch `develop`, with **Wait for CI** on, so a merge deploys only when CI is green. That step is still pending in [#57].

## Services

### `Postgres`

| Setting | Value                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| Image   | `ghcr.io/railwayapp-templates/postgres-ssl:17`. Railway's template starts on 18; the project uses 17 everywhere |
| Volume  | mounted at `/var/lib/postgresql/data`                                                                           |
| Access  | private network only, no public TCP proxy                                                                       |

The other services read its connection string through the reference variable `${{Postgres.DATABASE_URL}}`.

### `api`

| Setting            | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| Builder            | Dockerfile, `apps/api/Dockerfile` (variable `RAILWAY_DOCKERFILE_PATH`) |
| Pre-deploy command | `node dist/database/migrate.js`                                        |
| Healthcheck path   | `/health`                                                              |
| Public domain      | `https://api-production-f91265aa.up.railway.app`, port `3000`          |

| Variable                  | Value                                                         |
| ------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                | `production`                                                  |
| `PORT`                    | `3000`                                                        |
| `DATABASE_URL`            | `${{Postgres.DATABASE_URL}}`                                  |
| `DEV_AUTH_ENABLED`        | `false` (the API refuses to start with `true` in production)  |
| `CLIENT_IP_HEADER`        | `x-real-ip` (see [Client IP](#client-ip))                     |
| `PUBLIC_URL`              | `https://api-production-f91265aa.up.railway.app`              |
| `VONAGE_ENABLED`          | `true`, with the six Vonage variables (see [Vonage](#vonage)) |
| `RAILWAY_DOCKERFILE_PATH` | `apps/api/Dockerfile`                                         |

Migrations run before each new version starts. If they fail, the deploy stops and the previous version keeps running. That previous version also keeps serving while they run, so a migration must not break it: add first, remove in a later deploy.

#### Client IP

Railway's edge sends the client's IP in `X-Real-IP` and not in `X-Forwarded-For`, and the address the API sees on the socket changes from one request to the next. Without `CLIENT_IP_HEADER`, per-IP rate limits never trigger.

Checked on 2026-11-13 against the deployed API: 140 unsigned requests to a webhook in 15 seconds give 120 × `401` and 20 × `429`, also when every request sends a different made-up `X-Real-IP` (the edge overwrites it), and also through the client's `/api`. To check it again after a change:

```sh
seq 1 140 | xargs -P 20 -I@@ curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST -H 'Content-Type: application/json' -d '{}' \
  https://api-production-f91265aa.up.railway.app/webhooks/voice/event | sort | uniq -c
```

#### Vonage

The deployment uses the team's existing Vonage Application, the same one as development ([#57]):

1. **Done:** `VONAGE_API_KEY`, `VONAGE_API_SECRET`, `VONAGE_APPLICATION_ID`, `VONAGE_PRIVATE_KEY`, `VONAGE_VIRTUAL_NUMBER` and `VONAGE_SIGNATURE_SECRET` are set in the `api` service, with `VONAGE_ENABLED=true`.
2. **Pending:** in the Vonage dashboard, point the application's webhooks at the deployed API: Voice answer `/webhooks/voice/answer`, Voice event `/webhooks/voice/event`, Messages inbound `/webhooks/sms/inbound`, Messages status `/webhooks/sms/status`.

From then on, that application's webhooks reach the deployment and no longer a local ngrok tunnel.

#### Demo data

The deployed database is meant to hold the demo data. It isn't loaded yet: nothing could show it until the CRM has its login page, and the seed that creates the agents comes with [#31].

Vonage is on in the deployment, so a test mediation would call and text the phones in the demo data. **Before loading it, replace the seeded Spanish numbers (`+34611…`) with the team's own phones**: they may belong to real people.

When the CRM login is merged, load it once from inside the `api` container (the database has no public address). `db:seed` refuses to run with `NODE_ENV=production`, so this one run overrides it on purpose:

```sh
railway ssh --service api -- sh -c 'NODE_ENV=development SEED_AGENT_PASSWORD=<password> node dist/database/seed.js'
```

### `client`

| Setting          | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Builder          | Dockerfile, `apps/client/Dockerfile`                             |
| Healthcheck path | `/`                                                              |
| Public domain    | `https://client-production-8cd55b5b.up.railway.app`, port `8080` |

| Variable                  | Value                              |
| ------------------------- | ---------------------------------- |
| `API_URL`                 | `http://api.railway.internal:3000` |
| `PORT`                    | `8080`                             |
| `RAILWAY_DOCKERFILE_PATH` | `apps/client/Dockerfile`           |

Caddy (`apps/client/Caddyfile`):

- forwards `/api` and `/api/*` to the API without the `/api` prefix, together with the client's `X-Real-IP`;
- serves `/assets/*`, whose names carry a content hash, with a one-year immutable cache, and answers `404` for a missing asset;
- answers every other path with the file or with `index.html`, always with `Cache-Control: no-cache`, so a new deploy is picked up on the next visit.

The container refuses to start if `API_URL` is missing.

### `crm`

| Setting          | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Builder          | Dockerfile, `apps/crm/Dockerfile`                                                          |
| Healthcheck path | none: every page calls the API, so a health check would tie the CRM's deploys to the API's |
| Public domain    | `https://crm-production-cd0f5ed8.up.railway.app`, port `3001`                              |

| Variable                  | Value                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `API_URL`                 | `http://api.railway.internal:3000`, used at build time (rewrites) and at runtime. The build and the container stop without it |
| `PORT`                    | `3001`                                                                                                                        |
| `RAILWAY_DOCKERFILE_PATH` | `apps/crm/Dockerfile`                                                                                                         |

## Things to know

- Variables are set in Railway, never committed. `railway variable list --service <name>` shows them.
- While `DEV_AUTH_ENABLED` is off, the deployed CRM and client can't load data until their login pages exist ([#31], [#33]).

[#31]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
[#33]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/33
[#57]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/57
