# customer-support-logistics

A unified customer support and logistics platform for e-commerce delivery issues. Connects customers and support agents through a two-sided web/mobile app interface. Uses Vonage APIs to bridge real-time video, SMS, and phone calls with couriers without an app.

## Requirements

| Tool    | Version | Pinned in                       |
| ------- | ------- | ------------------------------- |
| Node.js | 22      | `.nvmrc`, `engines.node`        |
| pnpm    | 12.16.1 | `packageManager` (package.json) |

pnpm is provided by [Corepack](https://nodejs.org/api/corepack.html), which ships with Node.js:

```sh
nvm use
corepack enable
```

## Getting started

```sh
pnpm install
pnpm build
```

## Monorepo structure

```
apps/
  api/            NestJS backend
  client/         React PWA for customers
  crm/            Next.js CRM for support agents
packages/
  api-client/     Shared API client
  i18n/           Shared locales helpers and translated labels
  shared-types/   Shared TypeScript types
```

Workspaces are managed with pnpm (`pnpm-workspace.yaml`) and tasks are orchestrated with [Turborepo](https://turborepo.com) (`turbo.json`).

## Shared configuration

TypeScript, ESLint and Prettier rules live in `packages/config` (`@csl/config`). Apps and packages extend these presets instead of defining their own.

| Preset       | TypeScript                         | ESLint                     |
| ------------ | ---------------------------------- | -------------------------- |
| Base         | `@csl/config/tsconfig/base.json`   | `@csl/config/eslint/base`  |
| NestJS       | `@csl/config/tsconfig/node.json`   | `@csl/config/eslint/node`  |
| React (Vite) | `@csl/config/tsconfig/react.json`  | `@csl/config/eslint/react` |
| Next.js      | `@csl/config/tsconfig/nextjs.json` | `@csl/config/eslint/next`  |

Add `"@csl/config": "workspace:*"` to the workspace's `devDependencies`, then:

```jsonc
// tsconfig.json
{
  "extends": "@csl/config/tsconfig/react.json",
  "include": ["src"],
}
```

```js
// eslint.config.js
import config from '@csl/config/eslint/react';

export default config;
```

Prettier is configured once at the root through the `prettier` field in `package.json`.

## Scripts

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Run every app in development mode        |
| `pnpm build`        | Build every app and package              |
| `pnpm lint`         | Lint every app and package               |
| `pnpm typecheck`    | Type-check every app and package         |
| `pnpm test`         | Run every test suite                     |
| `pnpm format`       | Format the whole repo with Prettier      |
| `pnpm format:check` | Check formatting without writing changes |

To run a task in a single workspace: `pnpm --filter ./apps/<name> run <task>`.

## Documentation

- [Design](docs/design/): what users see, such as the [visual identity](docs/design/visual-identity.md).
- [Architecture](docs/architecture/README.md): how the system is built, and [how we use Vonage](docs/architecture/vonage.md).
- [Architecture Decision Records](docs/adr/README.md): why we made each important technical decision.
- [Client PWA](docs/pwa.md): install, updates and testing on a phone.
- [Internationalisation](docs/i18n.md): translation files, adding a key or a language, and SMS length.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or a pull request. It covers branches, commits, pull requests and the definition of done.
