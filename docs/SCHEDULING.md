# Versioned service calendars

## Implemented rules

- Accepted quotations now snapshot structured `window_start_local`, `window_end_local` and `schedule_timezone` alongside their human-readable service window and terms. Activation checks unique weekdays, accepted weekly frequency, site operating days and an accepting route. Existing accepted agreements are not rewritten.
- `schedule_versions` preserves weekday/window/timezone definitions and effective local-date ranges. The database rejects definition rewrites/deletion. An open effective range can be closed once when a later version is appended.
- A planned weekday revision must begin after the generated job horizon. Editing a recurring rule never silently moves an existing occurrence. Price, frequency and service-window changes require reviewed newly accepted terms; this command does not implement contract replacement.
- Job dates are local calendar dates. UTC start/end instants and IANA timezone are snapshotted on each occurrence. Overnight windows advance the **local** date. Generation does not rely on the PostgreSQL connection/session timezone.
- Nonexistent DST wall times return `409 DST_WINDOW_REVIEW` and roll back the generation transaction. Ambiguous overlapping wall times use PostgreSQL's standard-time offset, explicitly documented in calendar details. There is no silent gap-time shift.
- Unrecognized legacy free-text windows remain unconfigured and block new generation/assignment; the migration only extracts explicit recognized HH:mm–HH:mm windows. No time is invented.
- `UNIQUE(schedule_id, occurrence_date)` supplements the original schedule/version/date key. Retrying generation, even after calendar version changes, cannot recreate an existing cancelled date as another job.

## Operational changes

Only platform admin/operations can approve recurring-rule, pause, area-closure and subscription-end changes. Customer roles can read their authorized calendar but cannot directly approve these mutations. Dispatcher can reschedule/restore authorized jobs, never another partner's work.

- **Pause:** inclusive local date range. Pending scheduled/assigned jobs are cancelled with reason/audit; completed evidence remains unchanged.
- **Resume:** shorten/cancel a pause, retaining audit of its previous range. Previously cancelled jobs remain cancelled. Restore or reschedule each deliberately; no automatic resurrection or implied service charge.
- **Area closure:** explicit approved local date and reason, applies to all sites in the selected service area. Removing a closure does not automatically restore cancelled jobs. Calendar details expose the closure ID, scope and status.
- **In-flight work:** calendar changes lock affected pending/in-flight job rows before checking. EN_ROUTE/ARRIVED work blocks cancellation so the collector and operations must resolve the physical situation first.
- **Subscription end:** last service date is inclusive. Pending work beyond it is cancelled. Recorded collections/invoices are preserved; an end date cannot exclude already recorded later collections or extend a prior termination. Scheduler rollover marks elapsed subscriptions ENDED and sites PAUSED exactly once.
- **Reschedule:** an explicit replacement date, reason, entity version and source link. Original MISSED/FAILED history is retained. Other pending originals become RESCHEDULED. Replacement must satisfy current subscription, pause and closure rules, and needs a new collector/route assignment. It inherits `billing_occurrence_key`; software does not create an extra invoice/charge.
- **Restore:** only a cancelled eligible future/current occurrence without a replacement; clears its old assignment and preserves its logical billing key. The generic state endpoint cannot bypass reschedule/restoration checks.
- Assignment, journey/arrival and collection capture recheck calendar/service eligibility, including offline sync. A stale draft is rejected for review, not forced through.

Web and native share these action definitions. Schedule Details/Show all fields load authorized `/api/v1/schedules/{id}/calendar` data: up to 100 definitions, pauses and area closures per list, including IDs needed by the current manual-ID forms.

## Scheduled generation entry point

`GET /api/v1/internal/schedule` requires `Authorization: Bearer <CRON_SECRET>` plus server-only `SCHEDULER_USER_ID` and `SCHEDULER_MEMBERSHIP_ID`. The membership must still be active, belong to that user and grant platform operations authority. Use a dedicated operations identity; no client-supplied actor is accepted.

The handler awaits one database transaction: expire ended subscriptions, calculate each timezone's local today and generate today through today+14 days inclusive. All writes, audit/outbox and uniqueness checks are committed before response. Repeated calls remain safe and newly activated sites are not skipped just because an earlier invocation ran that day. The coarse transaction advisory lock is an intentional small-pilot choice, not a scalability claim.

There is **no enabled external cron or claimed delivery guarantee**. Configure an authorized durable scheduler only after verifying its actual frequency, retry, timeout and plan limits. Invoke the separate outbox retry endpoint as well. Invoice reminders remain unfinished. Scheduler credentials, account setup and observed deployment remain release dependencies.

## Coverage and remaining limits

PostgreSQL tests cover local date conversion, overnight windows, DST gaps/overlaps, versioned weekdays, pauses/resume/restoration, closures, inclusive end dates, rollover, replay idempotency, actor denial and simultaneous generation. Positive concurrent delivery splits run in separate database connections and conserve available source mass.

Tests use owned disposable PostgreSQL databases, seeded through the real command service; they do not reset or expand the developer's five-site pilot. Native bundles are compilation checks, not device/offline runtime acceptance.

Still incomplete: customer calendar-change request/approval messaging, calendar pickers replacing manual related IDs, true multi-country service-area/timezone policy, vehicle/time-window availability planning, capacity redirection, reminder delivery and production scheduler monitoring. These are not hidden behind a claim that all P0 is complete.
