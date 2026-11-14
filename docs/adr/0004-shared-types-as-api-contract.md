# 0004. `@csl/shared-types` is the API contract

- **Status:** accepted
- **Date:** 2026-11-08 (recorded retroactively; decided in [#3][i3])

## Context

The API, the client and the CRM exchange the same entities: orders, incidents, evidence, communications and incident events. If each app defines its own types, they drift apart and the errors only appear at runtime.

At the same time, the database model will be defined in `apps/api` with an ORM (to be chosen in [#23][i23]). Database models include things the frontends must not depend on or see, such as internal columns, relations, driver phone numbers or ORM-specific types.

## Options considered

### Share the ORM-generated types

- **Pros:** no duplication; the types always match the database.
- **Cons:** the frontends depend on the ORM and on how tables are stored; any change to the database breaks the frontends; it is easy to expose fields by accident.

### Generate the contract from OpenAPI

- **Pros:** the contract comes from the real endpoints, and the documentation is generated too.
- **Cons:** there are almost no endpoints yet; it adds a code generation step to the build.

### Hand-written TypeScript types in a shared package

- **Pros:** simple, with no runtime dependencies; changes to the contract show up in the pull request diff; it works the same in Node.js and the browser.
- **Cons:** the API has to map its database models to these types by hand; the types don't validate anything at runtime.

## Decision

`@csl/shared-types` is the contract between the API and its consumers:

- It contains plain TypeScript interfaces and `as const` arrays for enums (for example `INCIDENT_STATUSES`), with no runtime dependencies.
- It describes what goes over HTTP: IDs are strings and dates are ISO 8601 strings.
- Database models, ORM types and anything internal stay inside `apps/api`, which maps them to the shared types in its responses.
- `@csl/api-client` uses these types for its requests and responses.

## Consequences

- A change to the contract is a change in `packages/shared-types`, and the type checker shows every app it breaks.
- The API needs a mapping layer between database models and shared types. This is intentional: it is where we decide what each role can see.
- The API still validates incoming requests on its own, because shared types are only checked at compile time.
- When the API has enough endpoints, we can generate OpenAPI documentation and revisit this decision in a new ADR.

[i3]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/3
[i23]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/23
