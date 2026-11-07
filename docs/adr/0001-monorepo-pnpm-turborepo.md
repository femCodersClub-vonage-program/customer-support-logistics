# 0001. Monorepo with pnpm workspaces and Turborepo

- **Status:** accepted
- **Date:** 2026-11-08 (recorded retroactively; decided in [#1][i1])

## Context

The platform has three apps (`apps/api`, `apps/client`, `apps/crm`) and code that all of them share: TypeScript types for the API, an API client, and lint, TypeScript and Prettier config. A small team works on all of them at once, and many changes touch the API and a frontend in the same pull request.

We need one place where a change to a shared type is checked against every app that uses it, with one install, one lockfile and one CI.

## Options considered

### Several repositories

One repository per app, with the shared code published as npm packages.

- **Pros:** each app is independent; permissions and CI per repository.
- **Cons:** every change to a shared package needs a release and a version bump in each app; API and frontend changes can't be reviewed together; three times the CI and tooling setup.

### npm or Yarn workspaces, without a task runner

- **Pros:** no extra tool; workspaces link local packages.
- **Cons:** no task graph or cache, so every task runs in every workspace, in an order we would have to script by hand.

### pnpm workspaces + Nx

- **Pros:** task graph, cache, code generators and many plugins.
- **Cons:** more configuration and concepts than we need for three apps; plugins add their own layer on top of each framework's CLI.

### pnpm workspaces + Turborepo

- **Pros:** pnpm's strict `node_modules` prevents using dependencies that aren't declared, and its shared store makes installs fast. Turborepo adds a task graph and a cache with a single `turbo.json`, and runs each workspace's own scripts unchanged. `turbo prune` produces a minimal workspace for Docker images.
- **Cons:** fewer features than Nx (no generators); two tools to learn instead of one.

## Decision

A single repository using **pnpm workspaces** (`apps/*`, `packages/*`) and **Turborepo** to run tasks. It is the simplest setup that gives us a task graph and a cache, and each app keeps using its framework's own CLI.

## Consequences

- Shared packages are referenced with `workspace:*` and use the `@csl/*` scope. Tasks depend on `^build`, so shared packages are built before the apps that use them.
- Node 22 and the pnpm version are pinned (`.nvmrc`, `packageManager`), and pnpm is provided by Corepack.
- Docker images are built from a pruned workspace (`turbo prune`, see `apps/api/Dockerfile`).
- CI runs one job per app with `turbo run --filter`.
- If the repository grows to many more apps, or we need code generators, we can revisit Nx in a new ADR.

[i1]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/1
