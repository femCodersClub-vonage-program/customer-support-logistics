# 0002. Application stack: NestJS, React + Vite PWA and Next.js

- **Status:** accepted
- **Date:** 2026-11-08 (recorded retroactively; decided in [#4][i4], [#5][i5] and [#6][i6])

## Context

The platform has three parts, each used by a different person:

- **API:** the only part that talks to Vonage and the database. It receives Vonage webhooks, runs the incident state machine and issues tokens for the voice calls.
- **Client:** used by customers on their phones to log in, report incidents with photos or video, and join the mediation call from the browser.
- **CRM:** used by support agents on desktop to triage incidents, send SMS and run the mediation call.

The driver has no interface: they only use SMS and phone calls.

The team is small and has to maintain the backend and both frontends, so we want a single language. The customer app must work without going through app stores, and Vonage's silent authentication must work from the mobile browser.

## Options considered

### Language

- **TypeScript everywhere:** the same language and types in the backend and frontends, and Vonage has an official Node.js SDK (`@vonage/server-sdk`).
- **A different backend language** (for example Python or Java): Vonage has SDKs for them too, but we would lose shared types and need two toolchains.

### API

- **Express or Fastify on their own:** small and flexible, but we would have to design our own structure for modules, dependency injection, config validation and guards.
- **NestJS:** modules, dependency injection, guards and config validation are built in, so each feature (incidents, Vonage, webhooks) is a module with the same shape. It runs on Express by default. The cost is more boilerplate and decorators to learn.

### Customer client

- **Native app:** better device access, but it needs app stores, two platforms and installs before a customer can report an incident.
- **Next.js:** works, but its server rendering adds little for an app that runs behind a login and is installed as a PWA.
- **React + Vite single-page PWA:** fast to build, deployed as static files, and `vite-plugin-pwa` generates the manifest and service worker. Customers can install it from the browser.

### Agent CRM

- **Another React + Vite SPA:** the same setup as the client, but we would have to add routing, layouts and data loading ourselves.
- **Next.js:** file-based routing and nested layouts suit a desktop app with many screens (inbox, incident detail, mediation console). The cost is a second frontend setup to maintain.

## Decision

- **API:** NestJS on Node.js 22 with `@vonage/server-sdk`.
- **Client:** React + Vite, delivered as a PWA for mobile browsers.
- **CRM:** Next.js (React, App Router).
- Everything is written in TypeScript.

## Consequences

- Types are shared between the API and both frontends through `@csl/shared-types` (see [ADR 0004](0004-shared-types-as-api-contract.md)), and HTTP calls through `@csl/api-client`.
- Lint and TypeScript presets exist for each runtime in `@csl/config` (`node`, `react`, `next`).
- The client and the CRM are both React, but they have different build tools, routing and environment variable handling. Moving code from one to the other is not a straight copy.
- A native app stays out of the MVP. If we need one, the API doesn't change.

[i4]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/4
[i5]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/5
[i6]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/6
