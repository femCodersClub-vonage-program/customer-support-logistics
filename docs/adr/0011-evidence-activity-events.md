# 0011. Evidence activity events

- **Status:** accepted
- **Date:** 2026-11-16

## Context

Issue [#32](https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/32) requires an incident event when an evidence upload completes. The existing `incident_events` model is a state-transition history: every row has a `to_status` and optionally a `from_status`.

The current implementation records `Evidence uploaded` with the incident's current status as both `from_status` and `to_status`. It preserves a chronological audit entry without changing the incident state, but it makes a non-transition look like one. The same pattern is already used for assignment and driver-notification retry activity, and the forthcoming SSE work needs stable event semantics rather than text matching.

## Options considered

### Keep the current no-op transition

- **Pros:** no schema or contract migration; the audit trail is immediately visible to existing consumers.
- **Cons:** consumers must interpret equal statuses as an activity rather than a status change.

### Add an event kind to `incident_events`

Add a `kind` such as `status_changed` or `evidence_uploaded`.

- **Pros:** one chronological audit log with an explicit semantic model that is safe for i18n and SSE consumers.
- **Cons:** changes the established contract and requires migration and updates to existing consumers.

### Create a separate evidence activity table

- **Pros:** keeps transitions and attachment activity fully separate.
- **Cons:** timelines must combine two sources and the CRM needs additional queries.

## Decision

Evolve `incident_events` with a non-null `kind` enum. The initial values are `status_changed`, `evidence_uploaded`, `assigned`, and `driver_notification_resent`. The column defaults to `status_changed`, preserving the meaning of existing rows.

`from_status` and `to_status` keep their current nullability. Activity events retain the incident's current status in `to_status` (and in `from_status` where applicable); consumers determine the event meaning from `kind`, never from `reason`. `reason` remains optional free text.

The enum is part of `IncidentEvent` in `@csl/shared-types` and of the Zod contract in `@csl/contracts`.

## Consequences

Evidence uploads are recorded as `evidence_uploaded` activity events, while state changes are recorded as `status_changed`. Timeline and SSE consumers can render stable, localised event descriptions without parsing the free-text `reason` field. Existing database rows are migrated safely through the default value.
