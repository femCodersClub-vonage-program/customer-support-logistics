# Deployment

The API, the client and the CRM run on [Railway](https://railway.com), with PostgreSQL, in one project called `customer-support-logistics`. Why Railway and how it fits is in [ADR 0009](../adr/0009-hosting-on-railway.md).

Service settings live in Railway, not in the repository. This page lists every one of them, so the project can be checked or rebuilt by hand. **When you change a setting in Railway, update this page in the same pull request or right after.**

## Environment

One environment, `production`, deployed from the `develop` branch.

## Services

### `Postgres`

- Railway's PostgreSQL template. No public TCP proxy: only the other services reach it, over the private network.
- The other services read its connection string through the reference variable `${{Postgres.DATABASE_URL}}`.

### `api`

| Setting            | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| Builder            | Dockerfile, `apps/api/Dockerfile` (variable `RAILWAY_DOCKERFILE_PATH`) |
| Pre-deploy command | `node dist/database/migrate.js`                                        |
| Healthcheck path   | `/health`                                                              |
| Public domain      | port `3000`                                                            |

| Variable                  | Value                                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`                | `production`                                                                 |
| `PORT`                    | `3000`                                                                       |
| `DATABASE_URL`            | `${{Postgres.DATABASE_URL}}`                                                 |
| `DEV_AUTH_ENABLED`        | `false` (the API refuses to start with `true` in production)                 |
| `VONAGE_ENABLED`          | `false`, until the team decides which Vonage Application the deployment uses |
| `CLIENT_IP_HEADER`        | `x-real-ip`: Railway's edge puts the client IP there (see below)             |
| `RAILWAY_DOCKERFILE_PATH` | `apps/api/Dockerfile`                                                        |

Migrations run before each new version starts. If they fail, the deploy stops and the previous version keeps running.

#### Client IP

Railway's edge sends the client's IP in `X-Real-IP` and not in `X-Forwarded-For`, and the address the API sees on the socket changes from one request to the next. Without `CLIENT_IP_HEADER`, per-IP rate limits never trigger. To check it after a change, send a burst of unsigned requests to a webhook and expect `429` once the limit is reached:

```sh
seq 1 140 | xargs -P 20 -I@@ curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST -H 'Content-Type: application/json' -d '{}' \
  https://<api-domain>/webhooks/voice/event | sort | uniq -c
```

#### Demo data

The deployed database is meant to hold the demo data, so the team can show the app with realistic cases. It isn't loaded yet, on purpose:

- Nothing could show it yet: the deployed client and CRM have no login page, and the API doesn't accept `X-Dev-Actor` in production.
- The seed that creates the agents comes with the authentication work ([#31]). Loading the current seed first would mean emptying the tables and loading them again later.

When the CRM login is merged, the demo data is loaded once with the seed of that version, from inside the `api` container, since the database has no public address: `railway ssh --service api` (on Windows, with standard input closed: `< /dev/null`). `db:seed` refuses to run with `NODE_ENV=production`, so that single run sets `NODE_ENV=development` on the command line. It is a deliberate exception for this database, recorded here, not a change to the guard.

### `client`

| Setting          | Value                                |
| ---------------- | ------------------------------------ |
| Builder          | Dockerfile, `apps/client/Dockerfile` |
| Healthcheck path | `/`                                  |

| Variable                  | Value                              |
| ------------------------- | ---------------------------------- |
| `API_URL`                 | `http://api.railway.internal:3000` |
| `RAILWAY_DOCKERFILE_PATH` | `apps/client/Dockerfile`           |

Caddy (`apps/client/Caddyfile`):

- forwards `/api/*` to the API without the `/api` prefix, together with the client's `X-Real-IP`;
- serves `/assets/*`, whose names carry a content hash, with a one-year immutable cache, and answers `404` for a missing asset;
- answers every other path with the file or with `index.html`, always with `Cache-Control: no-cache`, so a new deploy is picked up on the next visit.

The container refuses to start if `API_URL` is missing.

### `crm`

| Setting          | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Builder          | Dockerfile, `apps/crm/Dockerfile`                                                          |
| Healthcheck path | none: every page calls the API, so a health check would tie the CRM's deploys to the API's |

| Variable                  | Value                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `API_URL`                 | `http://api.railway.internal:3000`, used at build time (rewrites) and at runtime (server components). The build and the container both stop if it is missing |
| `RAILWAY_DOCKERFILE_PATH` | `apps/crm/Dockerfile`                                                                                                                                        |

## Things to know

- Variables are set in Railway, never committed. `railway variable list --service <name>` shows them.
- While `DEV_AUTH_ENABLED` is off, the deployed CRM and client can't load data until their login pages exist ([#31], [#33]).
- Vonage stays disabled until its webhook URLs point at the deployed API.

[#31]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
[#33]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/33
