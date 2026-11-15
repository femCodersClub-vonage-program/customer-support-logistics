# 0009. Keep `x-dev-actor` until both logins exist

- **Status:** proposed
- **Date:** 2026-11-16

## Context

[ADR 0008](0008-authentication-and-sessions.md) removes `DevActorGuard`, the `x-dev-actor` header and `DEV_AUTH_ENABLED` in the same step that adds the session guard ([#31][i31]). This ADR replaces that one point; the rest of ADR 0008 stays as accepted.

When the session guard was built ([#61][p61]), neither the CRM nor the PWA had a login yet. Both called the API with `x-dev-actor` in development, and so did the e2e tests of orders, incidents and mediation. Removing the header in that step would have left the CRM and the customer routes without a way to call the API locally until both logins were merged.

## Options considered

### Remove the header with the session guard, as ADR 0008 says

- **Pros:** one way to authenticate from the start, and no development-only path in `AuthGuard`.
- **Cons:** the CRM and the customer routes stop working in development until both logins are merged, and every e2e test that uses the header has to move to session cookies in the same pull request.

### Keep the header inside `AuthGuard` until both logins exist

`AuthGuard` accepts `x-dev-actor` only when there is no valid session and `DEV_AUTH_ENABLED=true`, and the API refuses to start with that flag in production. A last step removes the header and the flag once the CRM and the PWA log in.

- **Pros:** the team keeps working in development while the logins are built, and each pull request stays focused on one change.
- **Cons:** a development-only path in the guard for a few days, and one more pull request to remove it.

## Decision

Keep the header inside `AuthGuard`, behind `DEV_AUTH_ENABLED`, until both logins exist, and remove it right after. The fallback is off unless the flag is set, the API refuses the flag in production, and it only lives while the logins are being built.

## Consequences

- While it exists, the fallback is covered by unit tests in `apps/api/src/auth/auth.guard.spec.ts`, and `apps/api/src/config/env.schema.spec.ts` checks that the API refuses `DEV_AUTH_ENABLED` in production.
- [#73][p73] removes the header, `DEV_AUTH_ENABLED` and the fallback, and moves the e2e tests of orders, incidents and mediation to session cookies, as ADR 0008 asks. After it is merged, `x-dev-actor` only appears in the code in tests that check it is neither sent nor accepted.

[i31]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/31
[p61]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/pull/61
[p73]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/pull/73
