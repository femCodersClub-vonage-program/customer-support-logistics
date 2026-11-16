# 0011. Evidence activity events

- **Status:** proposed
- **Date:** 2026-11-16

## Context

Issue [#32](https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/32) requires an incident event when an evidence upload completes. The existing `incident_events` model is a state-transition history: every row has a `to_status` and optionally a `from_status`.

The current implementation records `Evidence uploaded` with the incident's current status as both `from_status` and `to_status`. It preserves a chronological audit entry without changing the incident state, but it makes a non-transition look like one.

## Options considered

### Keep the current no-op transition

- **Pros:** no schema or contract migration; the audit trail is immediately visible to existing consumers.
- **Cons:** consumers must interpret equal statuses as an activity rather than a status change.

### Add an event kind to `incident_events`

Add a `kind` such as `status_changed` or `evidence_uploaded`, and make status fields nullable for activity events.

- **Pros:** one chronological audit log with an explicit semantic model.
- **Cons:** changes the established contract and requires migration and updates to existing consumers.

### Create a separate evidence activity table

- **Pros:** keeps transitions and attachment activity fully separate.
- **Cons:** timelines must combine two sources and the CRM needs additional queries.

## Decision

The implementation temporarily keeps the no-op transition and reason `Evidence uploaded`. The team should choose whether to evolve `incident_events` with an explicit event kind before the #32 pull request is marked ready for merge.

## Consequences

Evidence uploads remain auditable now. A future schema decision may require a migration and mapper/contract changes, but does not affect the stored objects or their ownership rules.
