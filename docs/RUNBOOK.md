# Operational setup and handover

## External dependencies — not provisioned

- **Neon**: separate dev/preview/prod branches or projects, migration owner and least-privilege runtime role, pooled DATABASE_URL and direct MIGRATION_DATABASE_URL. No credentials in clients. Confirm actual backup/PITR retention against purchased plan; no retention promise is made.
- **Vercel**: project/account authorization, monorepo root build using pnpm, Node 24, reviewed `vercel.json`, environment isolation and HTTPS origin allowlist. Deployment is not observed yet.
- **Auth**: random production Better Auth secret, production base URL/cookie HTTPS, allowed web origins plus `ecogrowth://`, real reset/invitation email transport, administrative MFA enforcement, reviewed email verification/account recovery and device revocation.
- **Private object store**: S3-compatible private bucket, region/endpoint and scoped key; deny public ACL/read, bucket lifecycle/CORS for allowed web upload origins; quarantine scanner + reviewed entity attachment authorization. Never persist file bytes on Vercel disk.
- **Scheduler/queue**: `/api/v1/internal/outbox` retries publication; `/api/v1/internal/schedule` performs timezone-aware rolling generation and subscription expiry. Both require server-only CRON_SECRET; schedule generation also verifies SCHEDULER_USER_ID/SCHEDULER_MEMBERSHIP_ID as an active dedicated platform operations identity. See `SCHEDULING.md`. Configure an external durable scheduler only after checking actual plan invocation/duration limits. There is no enabled cron purchase/config or unsupported retry guarantee. Invoice reminder scheduling is not released.
- **Real time**: Ably API key server-side, authenticated least-privilege subscribe tokens and scope fan-out must be completed before activating managed channels. Currently polling is explicit; do not promise five-second managed-event delivery.
- **Native**: Expo EAS project, Android signing, Apple signing/account and actual build device tests. Push ID/consent/setup not implemented. No public store release authorization.
- **Operations/legal**: real provider approvals/rates/contracts, accepting facilities and material rules, authorized residual destinations, approved legal notices, incident/privacy/support contacts, tax and billing principal/coordinator decisions.

## Migration/release sequence

1. Run type/unit/integration/browser tests against isolated PostgreSQL, never prod fixtures. Check `pnpm audit` and Expo compatibility.
2. Obtain fresh staging database backup/branch; inspect SQL migration and unique/check constraints. Direct migration URL and migration role only in CI protected environment.
3. Run `pnpm db:migrate`. Checksummed migration history and advisory transaction lock prevent drift/concurrent runners. Add a new migration for any later schema change; never edit an applied one.
4. Deploy a preview/staging environment; verify auth, CSRF, tenant isolation, cookie attributes, native HTTPS/CORS and signed private URLs.
5. Run complete physical/finance end-to-end and restart persistence checks. Exercise reconciliation, stale offline data and payment duplicates.
6. Backup/restore drill and operator sign-off; only then seek production deployment/build authorization. Seed refuses production; **DEMO_MODE must be false and no demo records may exist in production**.
7. Migration rollback is forward-fix or restore to a verified branch/snapshot. Do not drop evidence/ledger tables to undo a release. Rehearse rollback against staging and note backup recovery point.

## Backup / restore drill

Use direct URL and actual role permissions. Encrypt backup output, restrict operator access; do not commit dumps.

```sh
pg_dump --format=custom --no-owner "$MIGRATION_DATABASE_URL" --file=ecogrowth-backup.dump
# Restore only into a NEW, isolated database, never over production:
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" ecogrowth-backup.dump
```

Verify migration hashes, row counts, FK validity, financial totals by currency, audit continuity, collection/receiving allocation sums and a read-only application flow. Record achieved RPO/RTO and the actual plan retention. Local dump/restores into `ecogrowth_restore_check` and, after calendar migrations, `ecogrowth_restore_calendar_check` passed with site/collection/receiving/invoice/migration counts and USD allocation totals checked. The later restore includes all five migrations and five schedule-version records. This does not establish Neon production backup coverage, RPO/RTO or plan retention.

## Incident handling

Incident owner/contact must be assigned before launch. Disable affected memberships; expire parent sessions and revoke native credentials, rotate leaked provider/DB/auth keys and invalidate signed URLs via object access revocation. Preserve redacted evidence and correlation IDs. Do not log passwords/tokens/provider secrets. Investigate cross-tenant access, payment duplication, receiving mismatch, suspicious file access and failed scheduler jobs. Communicate operational pauses/redirection, never invent a receiving destination.

## Monitoring and recurrence

Monitor API error/authorization rates; stale outbox (>5 minutes), dead letters, overdue reconciliation, open residual destination cases, stale receiving proof, failed jobs and overdue unpaid invoices. Current UI/API reports do **not** implement a monitoring alert service. Configure alerts/contacts externally and test them.

Recurring cost inventory: Vercel hosting/function usage, Neon compute/storage/backup, private storage/egress/scanning, auth mail, Ably messages/channels, scheduler/queue, EAS builds and Apple/Google accounts. Optional SMS/WhatsApp/maps/payment fees remain unconfigured; no live rates are invented.
