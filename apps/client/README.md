# `@csl/client`

React + Vite PWA for customers: log in, see their orders, report an incident and join the mediation call. How it is installed and updated is in [PWA](../../docs/pwa.md).

## Development

```sh
pnpm --filter ./apps/client dev
```

It runs at http://localhost:5173. Vite's dev server forwards `/api/*` to the API, so the browser sees the API on the same origin ([ADR 0008](../../docs/adr/0008-authentication-and-sessions.md)).

| Variable  | What it is                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `API_URL` | Where `/api/*` goes, in development and in the deployed container (`http://localhost:3000` by default in development) |

## Deployment

The client is built to static files and served by Caddy (`Dockerfile`, `Caddyfile`), which also forwards `/api/*` to the API. The container needs `API_URL` and refuses to start without it. Every setting of the deployed service is in [Deployment](../../docs/architecture/deployment.md#client).
