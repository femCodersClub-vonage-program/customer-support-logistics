# 0013. Background jobs with pg-boss on PostgreSQL

- **Status:** proposed
- **Date:** 2026-11-25

## Context

The mediation flow approved in [`docs/architecture/vonage.md`](../architecture/vonage.md) needs work that happens later than the request that causes it ([#85][i85]):

- The driver gets an SMS, and the call comes 2 minutes later.
- When the driver doesn't answer, the API calls again 60 seconds later, up to twice, and then sends a fallback SMS.
- The confirmation SMS after closing a mediation ([#86][i86]) must go out after the status change commits, and a Vonage failure must not undo it.

Today the API only has `BackgroundTasks` (`apps/api/src/webhooks/background-tasks.ts`), which keeps promises in memory. A restart loses them, and there is no way to wait 2 minutes. The work has to survive a restart without placing two calls for the same attempt.

Constraints:

- One API instance on Railway today ([ADR 0009](0009-hosting-on-railway.md)), but nothing should break if we run more.
- PostgreSQL is the only stateful service deployed. `REDIS_URL` is in the env schema and Redis is in Docker Compose, but nothing uses it and there is no Redis service on Railway.
- The team is small: no new service unless it pays for itself ([ADR 0012](0012-real-time-updates-sse.md) chose PostgreSQL `LISTEN/NOTIFY` for the same reason).
- Volume is tiny: a few jobs per mediation, and delays of seconds or minutes, not milliseconds.

## Options considered

### BullMQ on Redis

The architecture overview suggested it. Jobs live in Redis, and a worker in the API process takes them.

- **Pros:** widely used with NestJS (`@nestjs/bullmq`). Delays are precise to the millisecond. Rich features: rate limits, priorities, repeatable jobs, dashboards.
- **Cons:** a new Railway service to pay for, back up and monitor. A job is not part of the PostgreSQL transaction that causes it: if the transaction commits and the process dies before the job is added, the job is lost. If the job is added first and the transaction rolls back, a call goes out for a change that never happened. Avoiding both needs an outbox table, which is a second queue. Tests need a Redis next to the PostgreSQL they already use.

### pg-boss on PostgreSQL

pg-boss keeps jobs in tables in its own `pgboss` schema, in the database we already have, and takes them with `SELECT … FOR UPDATE SKIP LOCKED`.

- **Pros:** no new service. A job can be added in the same transaction as the change that causes it (`fromDrizzle(tx, sql)`), so it exists if and only if the change committed. Jobs survive restarts, and several instances share them safely. It has delays (`startAfter`), retries and retention. It creates and migrates its own schema on start. In tests it uses the same PostgreSQL, and `drain()` runs the ready jobs on demand.
- **Cons:** workers poll (every 2 seconds by default), so a delay is precise to a few seconds. It adds load and connections to the main database (its own pool, 5 connections at most). Fewer people know it than BullMQ.

### Keep `BackgroundTasks` and timers in memory

- **Pros:** no dependency.
- **Cons:** a restart loses pending calls and retries, which the issue rules out.

## Decision

pg-boss on PostgreSQL. Adding a job in the same transaction as the change that causes it removes a whole class of bugs. It saves a Railway service, and the volume and timing needs are far within what it handles.

The details:

- **Module.** `JobsModule` (`apps/api/src/jobs`) is global and gives a `JobQueue` (`JOB_QUEUE` token), so services don't depend on pg-boss directly. `send(tx, name, data, { delaySeconds })` adds a job inside a Drizzle transaction, and `work(name, handler)` registers a worker. The queues are created on start.
- **Connection.** pg-boss uses `DATABASE_URL` with its own pool and the `pgboss` schema. No new variable or service. `JOBS_POLLING_INTERVAL_SECONDS` (2 by default) sets how often workers look for jobs.
- **Idempotency lives in our tables, not in the queue.** Every effect a job has (an SMS, a call) is reserved first as a `Communication` with a unique `idempotencyKey`, in a transaction that also checks the incident. A job that runs twice finds the reservation and does nothing. pg-boss retries a job that throws (twice by default); a Vonage error is not thrown, it is stored as a `failed` `Communication`.
- **Tests.** e2e tests use the real pg-boss on the test database, with polling set to an hour so that nothing runs on its own. A fixture moves `start_after` back (a fake clock for jobs) and calls `drain()` to run what is due. Stopping the app and starting a new one with the same database tests a restart.

## Consequences

- Anything that must happen after a commit, later, or more than once uses a job rather than `BackgroundTasks`. `BackgroundTasks` stays for the invalid-reply SMS of the webhooks until someone moves it.
- The database holds the `pgboss` schema, and pg-boss migrates it when the API starts. Completed jobs are deleted after 7 days.
- The API uses up to 5 more PostgreSQL connections per instance, besides the one for `LISTEN/NOTIFY`.
- Delays are approximate: "2 minutes" means 2 minutes plus up to one polling interval.
- A job that dies between reserving a call and getting Vonage's answer leaves the reservation in `pending` and does not call again for that attempt (at most once). An SMS whose process dies between sending and storing Vonage's id can go out twice (at least once).
- We would revisit this if job volume grows enough to load the main database, if we need sub-second timing, or if Redis is deployed for something else anyway.

[i85]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/85
[i86]: https://github.com/femCodersClub-vonage-program/customer-support-logistics/issues/86
