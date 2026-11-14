# 0007. Zod schemas in `@csl/contracts` as the runtime API contract

- **Status:** proposed
- **Date:** 2026-11-09

## Context

[ADR 0004](0004-shared-types-as-api-contract.md) made `@csl/shared-types` the API contract: plain TypeScript interfaces and `as const` enums, with no runtime dependencies. It also noted that the API still has to validate requests on its own, and that we would revisit the contract once there were enough endpoints to generate OpenAPI documentation.

[#28][i28] adds the first real endpoints (incidents and orders). It asks for request validation with zod, an OpenAPI document generated from the schemas, and schemas that `@csl/api-client` ([#7][i7]) can import so that the client and the server share one contract.

## Options considered

### Add zod to `@csl/shared-types`

- **Pros:** one package for the whole contract.
- **Cons:** breaks the "no runtime dependencies" rule of ADR 0004; every consumer of the plain types (including the database schema in `apps/api`) pulls in zod.

### Keep the zod schemas inside `apps/api`

- **Pros:** no new package.
- **Cons:** `@csl/api-client` and the frontends can't import them; the request and response shapes would be written twice.

### A new `@csl/contracts` package on top of `@csl/shared-types`

- **Pros:** `@csl/shared-types` keeps its rule; the schemas are shared by the API (validation and OpenAPI) and the client (typing and, if needed, parsing responses); enums are imported from `@csl/shared-types`, so there is a single list of literals.
- **Cons:** one more package; entity shapes exist both as interfaces and as schemas.

## Decision

We add `@csl/contracts`, which depends on `zod` and `@csl/shared-types`:

- It holds the request schemas (body, query, params), the response schemas and the error shape of the HTTP API.
- Enum schemas are built from the `as const` arrays in `@csl/shared-types` (`z.enum(INCIDENT_STATUSES)`), never from new literals.
- Entity schemas are checked against the shared interfaces with `satisfies z.ZodType<Incident>`, so the type checker catches any drift between the two.
- Schemas carry OpenAPI metadata with zod's native `.meta({ id })`. The API turns them into an OpenAPI 3.1 document with `zod-openapi`. The contract package itself doesn't depend on any OpenAPI library.

`@csl/shared-types` stays as described in ADR 0004: it's still the source of the domain types and enums.

## Consequences

- A change to a request or response is a change in `packages/contracts`, and it shows up in the API, the client and the OpenAPI document at the same time.
- Consumers of `@csl/contracts` ship zod. That is acceptable for the PWA and the CRM, which already validate forms.
- `nestjs-zod` doesn't support NestJS 12 yet, so the API uses its own validation pipe. If it adds support, we can reconsider.

[i7]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/7
[i28]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/28
