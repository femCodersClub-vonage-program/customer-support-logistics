# `@csl/crm`

Next.js CRM for support agents: the incidents inbox, the incident file and the mediation call.

## Development

```sh
pnpm --filter ./apps/crm dev
```

It runs at http://localhost:3001. The `/api/*` rewrites in `next.config.ts` forward requests to the API, and server components call the API directly.

| Variable       | What it is                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `API_URL`      | The API's address. Server components read it at runtime and the `/api/*` rewrites at build time |
| `DEV_AGENT_ID` | Temporary: the agent sent as `X-Dev-Actor` until the CRM has its login page ([#31])             |

## Deployment

The CRM runs `next start` in a container built from `Dockerfile`. `API_URL` must be set when the image is built, because Next.js fixes the rewrites at build time; the build and the container both stop without it. Every setting of the deployed service is in [Deployment](../../docs/architecture/deployment.md#crm).

[#31]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
