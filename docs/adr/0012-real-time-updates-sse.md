# 0012. Real-time updates with SSE and PostgreSQL `LISTEN/NOTIFY`

- **Status:** proposed
- **Date:** 2026-11-24

## Context

Incidents are created by customers in the PWA and change status from the CRM and from Vonage webhooks (driver replies, calls). Until now an agent only saw those changes after reloading, and two agents could work on the same incident without knowing it. [#40][i40] asks for the CRM inbox and incident detail to update by themselves within a couple of seconds. The CRM part is in [#83][i83].

Constraints:

- The updates only go from the API to the browser. The CRM never needs to send messages back over the same channel (presence is out of scope).
- The CRM already authenticates with the `csl_session` cookie ([ADR 0008](0008-authentication-and-sessions.md)), and the browser reaches the API through the CRM's `/api/*` route.
- We deploy one API instance on Railway today ([ADR 0009](0009-hosting-on-railway.md)), but nothing should break if we run more.
- The team is small: no new service unless it pays for itself.

Two decisions are needed: the transport to the browser, and how an API instance learns about a change made by another instance (or by a webhook handled by another instance).

## Options considered

### Transport: Server-Sent Events

`GET /events/stream` returns `text/event-stream`, using NestJS's `@Sse()`.

- **Pros:** plain HTTP, so it goes through the CRM's proxy and Railway with the session cookie and the existing `AuthGuard` and `@Roles('agent')`. The browser's `EventSource` reconnects by itself. No new dependency on either side.
- **Cons:** one direction only. Some proxies close idle connections, so the API has to send heartbeats. `EventSource` does not expose the HTTP status, so the CRM cannot tell a `401` from a network error.

### Transport: WebSocket (`socket.io` or `ws`)

- **Pros:** two directions, which would allow presence ("agent X is viewing this incident") later.
- **Cons:** a new library and gateway in NestJS, its own authentication handshake instead of the guards we already have, and the Next.js proxy does not forward WebSocket upgrades from a route handler. We do not need browser → server messages.

### Fan-out: in-memory emitter

Each API instance publishes and listens in its own process.

- **Pros:** the simplest option, no database round trip.
- **Cons:** only works with one instance. A change handled by instance A never reaches an agent connected to instance B.

### Fan-out: PostgreSQL `LISTEN/NOTIFY`

The code that changes an incident runs `pg_notify('csl_incident_events', <json>)` inside its transaction. Each API instance keeps one connection with `LISTEN csl_incident_events` and forwards what it receives to its open streams.

- **Pros:** no new service: PostgreSQL is already required. PostgreSQL delivers a notification only when its transaction commits, so a change that rolls back is never announced and an event never arrives before the data it describes. Works with any number of instances.
- **Cons:** notifications are not stored: a listener that is disconnected misses them. One extra connection per API instance, outside the pool. A payload is limited to 8000 bytes.

### Fan-out: Redis pub/sub

- **Pros:** made for this, and `REDIS_URL` is already in the configuration.
- **Cons:** Redis is not deployed yet, so it would be a new service to run and monitor. Publishing happens outside the database transaction, so we would have to publish after the commit ourselves, and an event can be lost if the process stops in between. It does not store messages either.

## Decision

Server-Sent Events for the transport and PostgreSQL `LISTEN/NOTIFY` for the fan-out. SSE fits a one-way stream and reuses the session and guards we have. `LISTEN/NOTIFY` supports several instances without a new service, and publishing inside the transaction keeps events consistent with the data.

The details:

- **Payload.** Each event is small: `{ type, incidentId, status?, updatedAt }` (`incidentStreamEventSchema` in `@csl/contracts`). The CRM fetches what it needs through the REST API instead of the server pushing whole objects, so the stream never sends more than the agent is allowed to read and stays far below the 8000-byte limit. The types are `incident.created`, `incident.status_changed`, `incident.assigned`, `incident.evidence_added`, `incident.communication_added` and `incident.communication_updated`.
- **Messages.** Events are unnamed SSE messages with an `id` and the JSON as `data`. A `: heartbeat` comment goes out every 25 seconds so that proxies keep the connection open; `EventSource` ignores comments.
- **No replay: fetch again after reconnecting.** Since notifications are not stored, the API does not replay missed events and ignores `Last-Event-ID`. After every reconnection the CRM fetches the data it shows again. Event ids are only unique, not ordered.
- **No silent gaps.** When an instance loses its `LISTEN` connection, it ends all its open streams and answers `503` to new ones until it listens again. The CRM reconnects, and its fetch after reconnecting happens once the instance is listening again, so it does not miss changes.
- **Access.** Agents only. Customers get `403`, as the PWA is out of scope and uses refetch on focus.

## Consequences

- Every place that changes an incident or its communications has to call `publishIncidentChange` or `publishCommunicationChange` (`apps/api/src/events/publish-incident-event.ts`) with the same transaction. A missed call means a change the CRM only sees after a reload. Evidence uploads ([#32][i32]) emit `incident.evidence_added` when they land.
- Each API instance uses one more PostgreSQL connection, and Railway's connection limit has to allow for it.
- The session is only checked when the stream opens. A stream stays open after the session expires or is deleted from another tab, until the connection drops. The CRM closes its own stream on logout ([#83][i83]).
- A stream that stays open on a slow client is limited by NestJS's pending data limit, and the client then reconnects and fetches again.
- We would revisit this if we need replay of missed events (an outbox table read by id), messages from the browser (WebSocket), or if Redis is deployed for queues anyway, which could also take the fan-out.

[i32]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/32
[i40]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/40
[i83]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/83
