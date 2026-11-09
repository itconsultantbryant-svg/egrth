# Known limitations / release blockers

This is an implemented foundation and partial P0/P1 pilot, **not the entire requested release**. Neon branches and Vercel production deployment are provisioned (`DEPLOYMENT.md`); production has no seeded operational records and is not launch-approved. No paid provider purchase or signed build success is claimed. Prior audit reported two moderate Expo transitive advisories and no high/critical findings; new dependencies require fresh review rather than assuming that historical result remains current.

## P0 code work still required (not external-account excuses)

- Invitation expiry, reviewed customer organization provisioning, password-reset mail delivery, verified-email policy, enforced admin MFA and full user/session administration. Signup currently creates no membership. Better Auth two-factor backend is enabled but UI/enforcement are unfinished.
- Remaining quote-bound commercial approval policies, duplicate-site review UI, real acceptance guidance/material rules and training evidence. Versioned weekday calendars, pauses/rescheduling, service-area closures, subscription end/expiry and IANA/DST-aware generation are now implemented/tested; advanced calendar request/approval UX and actual multi-country configuration are not.
- Vehicles and overlapping collection windows, full facility-capacity accounting, authorized redirection/outage flows and multi-source manifest UI (API supports splits/multiple sources).
- Receiving manual source allocation alternative, dedicated versioned evidence correction/approval records, closure and proof attachment review. Current pro-rata allocation must be reviewed; free-text proof references are not verified uploads.
- Full invoice state machine (draft/void/overdue), credit/refund handling, service-earned recognition, reviewed tax/billing-role settings and complete financial reports.
- Object-level parent links/scanner/reviewer attachment workflow, rate-limit policy refinements (auth and durable mutation/upload/export buckets exist), production CSP and comprehensive FK/index/performance hardening.
- Dashboard metrics currently bounded to 1,000 newest rows per resource; explicitly labelled, not full ledger aggregation. Date/service-area filters, paying-site definition, reliability, receiving coverage, source-specific accepted/treatment reports and printable PDF summaries need completion. CSV is bounded page export, not large background export.
- Full admin section set and role-specific label/shell refinements: partner approvals, facilities/material rules/service-area management, settings and user/vehicle management are not complete. Existing read-only scaffolds are labelled.
- Outbox event routing currently scopes invalidations to the acting membership organization, not all affected authorized job/customer/facility subscribers; managed real-time token issuance is deliberately disabled. Polling works independently of publication. Notifications read preference/delivery and invoice reminder workflows remain incomplete. Authenticated rolling schedule generation/expiry entry point is implemented; external scheduler setup and observed invocations are not.

## P1 code work still required

- Compost batch feedstock locking/allocation, process states/logs/output/maturity evidence, ownership and source-output attribution. Schema and read-only fixture are not completed workflows.
- Partner charge approval/payables/settlement disputes, route actual/estimated costs, cost allocation, deposits/liability/container lifecycle, multi-site teams, push, advanced reporting and safe asynchronous exports.
- Native file attachment queue, camera scan flow, automatic sync triggering, local cache renewal/recovery UX; all device encryption/offline/restart/accessibility cases must be observed. Native forms are functional scaffolds but rely on manual related IDs; they need usability review.

## External release dependencies

Neon/Vercel/account secrets, storage + scanner, durable job provider, approved auth mail, actual contracts/material approvals/legal notices, EAS signing accounts and native toolchains. Local Xcode and Android SDK binaries were not found at standard paths; no emulator/signed artifacts have been tested. No real payment provider is enabled; manual references do not settle until authorized finance confirms actual funds.

## P2

Additional countries/providers, facility planning, official payment adapters, reviewed emissions methodology and anomaly suggestions remain disabled/unimplemented. No carbon credits, certification badges or carbon-claim ownership are created by this application.
