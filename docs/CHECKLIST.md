# EcoGrowth implementation checklist

This file tracks **implemented and observed**, not intended completion. No release is approved yet.

## A — foundation (in progress)
- [x] Inspect repository: only supplied PNG, no application or existing instructions.
- [x] Preserve supplied logo; forest/emerald shared tokens.
- [x] Establish npm workspaces, shared validation and permission matrix.
- [x] Verify resolved dependency compatibility: pnpm lock, web build, both TypeScript clients, Expo install check.
- [x] Core PostgreSQL migrations, ERD, command OpenAPI schemas and decision log. Complete requested entity set remains unfinished.
## B — identity and shells
- [x] Better Auth web cookies; native short-lived credentials/rotating refresh implementation; explicit organization switching. Native device verification pending.
- [x] All ten roles: executable default-deny API scopes and web/native resource navigation. Full section management is not complete.
- [ ] Invitations, reset delivery, admin MFA and revocation verified.
## C — onboarding and scheduling
- [x] Site request, assessment, immutable quote acceptance, approval/training, subscription core commands; exercised by demo seed.
- [x] IANA-timezone weekly recurrence, immutable version snapshots, pauses/area closures, inclusive end dates and explicit linked rescheduling/restoration. PostgreSQL calendar suite passes; isolated browser flow covers activation/generation/assignment and the downstream pilot.
## D — physical operations
- [x] Assigned collector capture; independent receiving; transaction-locked manifest splits, including positive simultaneous split allocations against available source mass in separate connections.
- [ ] Discrepancies, reviewed reconciliation and residual destination evidence.
## E — pilot operations
- [x] Invoice snapshots, payment submission/independent confirmation, complaints core workflows; remaining financial states in limitations.
- [x] Bounded scoped dashboard, audit, explicit polling status, five fictional sites persisted through validated commands. Complete reports remain blocked on code work.
## F — P1 (not release-complete)
- [ ] Batches/output, payables/cost ledger, deposits/container lifecycle.
- [ ] Native bounded offline cache, restart/sync/conflict/attachment recovery.
- [ ] Push, native full admin workflows, advanced exports and notifications.
## G — verification and release (blocked pending actual checks)
- [x] Core domain/PostgreSQL security coverage includes HTTP cookie CSRF, native refresh reuse revocation and authenticated tenant CSV scope; not the entire requested suite.
- [x] Expanded combined suite: 53 tests pass across 3 files, including 19 isolated calendar/concurrency tests, two-receiver race protection and calendar-history IDOR coverage. Disposable tests preserve the developer pilot.
- [x] Initial browser acceptance: 2 tests pass using installed Chrome, including 320/375/768/1280/1920 overflow checks, sign-in/org switching and serious/critical axe checks. Full operational/keyboard/screen-reader suite remains incomplete.
- [x] Added no-mock operational browser acceptance passes: request → assessment → quote/acceptance → activation/schedule/assignment → capture → handover/independent receiving → reconciliation → invoice → pending evidence/finance confirmation → complaint resolution. Runs on disposable PostgreSQL with real web/API; no treatment/output or signed-native coverage inferred.
- [x] Calendar dialog/browser accessibility regression: authorized history, invalid-date error announcement/focus, Escape dismissal and trigger focus restoration pass.
- [x] Preliminary local public-view budget after static React-rendered home/bootstrap split: FCP 1.872s, heading confirmation 3.802s under documented constrained conditions; cache/offline/lazy-login assertions pass.
- [ ] Deployment/multi-run/mobile hardware performance gate remains open; no production SLA inferred from a single local pass.
- [ ] Android build/device and iOS simulator/development build checks.
- [x] Android and iOS Metro/Hermes exports observed. Bundles are not signed binaries or device tests.
- [x] Native source bundles re-exported after calendar controls: Android/iOS JavaScript exports pass. Calendar device/keyboard/offline behavior remains unverified.
- [ ] Neon staging, private storage, auth mail, durable scheduler/provider credentials.
- [ ] Vercel observed deployment; signed native artifacts; restore drill.
- [x] Local PostgreSQL backup/restoration to separate database verified; Neon recovery plan/production restore still unverified.

See `TEST-RESULTS.md` for commands actually executed and `RUNBOOK.md` for external setup. Do not call this system production-ready while any P0 gate is unchecked.
