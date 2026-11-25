# `@csl/client`

React + Vite PWA for customers: log in, see their orders, report an incident and join the mediation call. How it is installed and updated is in [PWA](../../docs/pwa.md).

## Development

```sh
pnpm --filter ./apps/client dev
```

It runs at http://localhost:5173. Vite's dev server forwards `/api/*` to the API, so the browser sees the API on the same origin ([ADR 0008](../../docs/adr/0008-authentication-and-sessions.md)).

Evidence uploads use a presigned URL directly against the S3-compatible storage service. `docker compose up seaweedfs seaweedfs-init` configures the `evidence` bucket to allow browser requests from `http://localhost:5173` and `http://127.0.0.1:5173`. When testing from a phone through an HTTPS tunnel, set `STORAGE_CORS_ALLOWED_ORIGINS` to the tunnel origin before starting the compose services.

For phone testing, set `STORAGE_PUBLIC_ENDPOINT` in the API environment to the browser-reachable HTTPS storage origin (for example, `https://storage.example.com`). Signed upload and download URLs use that endpoint, while the API uses `STORAGE_ENDPOINT` for internal storage operations. Both endpoints must reach the same bucket with the same credentials; the proxy must preserve the signed host, path and query string. Include the PWA origin in bucket CORS too. If `STORAGE_PUBLIC_ENDPOINT` is unset or empty, signing falls back to `STORAGE_ENDPOINT` for local development. Its default `http://localhost:8333` only works from the development machine, not from a phone or an HTTPS PWA. The uploader follow-up must verify the complete flow on a phone.

| Variable  | What it is                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `API_URL` | Where `/api/*` goes, in development and in the deployed container (`http://localhost:3000` by default in development) |

## Deployment

The client is built to static files and served by Caddy (`Dockerfile`, `Caddyfile`), which also forwards `/api/*` to the API. The container needs `API_URL` and refuses to start without it. Every setting of the deployed service is in [Deployment](../../docs/architecture/deployment.md#client).
