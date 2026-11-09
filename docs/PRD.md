# EcoGrowth Liberia — Product Requirements Document

Version: 1.0 · 8 November 2026 · Status: implementation baseline and release requirements, not release approval.

## 1. Product purpose

EcoGrowth coordinates organic-waste services for Liberian food businesses, collection partners and receiving facilities. The product connects onboarding, commercial agreements, schedules, physical measurements, independent receiving and financial review in one auditable system. Web and native clients use the same authorized API and PostgreSQL records.

Primary initial geography: a reviewed Sinkor/Monrovia operating area. Coverage is not guaranteed by software presence. Expansion requires operating agreements, material policies, timezone/capacity review and onboarding approval.

## 2. Problems and intended outcomes

- Businesses need clear service dates, responsibilities, invoices and a way to resolve missed service.
- Dispatchers need authorized assignments and exception handling without losing original occurrence history.
- Collectors need reliable capture, traceable handovers and safe handling of offline drafts.
- Facilities must record their own receiving measurements rather than inherit collector weights as fact.
- Finance must distinguish submitted payment evidence from independently confirmed funds.
- Management needs stage-specific reporting without implying that collection proves composting or emissions savings.

Success means dependable service records, fewer unresolved exceptions, conserved mass allocations, tenant-safe access and reconstructable decisions. It does not mean maximizing a decorative impact counter.

## 3. Roles and scope

| Role | Required responsibility |
|---|---|
| Platform administrator | Organization, membership, settings and security administration; exceptional access audited |
| Operations manager | Site review, activation, schedule changes, operational exceptions and reconciliation |
| Finance officer | Invoice issuance, independent payment review, approved financial adjustments |
| Read-only reviewer | Authorized inspection/export without operational mutation |
| Customer owner | Own sites, agreement acceptance, service records, invoices and complaints |
| Customer staff | Restricted site-level operational access; no implied owner authority |
| Partner dispatcher | Own partner assignments, route planning and approved rescheduling |
| Collector | Assigned journey, pickup capture, source allocation and delivery handover |
| Facility manager | Own facility operations, receiving oversight and authorized processing |
| Receiving officer | Independent receiving measurements, rejection and discrepancy evidence |

Every request verifies active membership and organization. Hidden navigation is not authorization. Object parents, exports, dashboards, calendar history and file access must apply the same scope. Organization switching clears previous protected caches. Customer ownership does not imply access to other customers on a shared route.

## 4. Scope and priorities

### P0: controlled operating pilot

Identity and provisioning; reviewed sites and terms; trained activation; dated scheduling; assignments; source measurements; independently recorded receiving; discrepancies and residual tracking; invoices and finance confirmation; complaints; audit; secure deployments and recovery; truthful offline/update states.

Many operational commands are implemented, but invitations/reset/MFA, corrections and portions of commercial/financial administration remain release blockers. See `LIMITATIONS.md` for current implementation gaps.

### P1: operational depth

Vehicles and overlapping availability; richer capacity/redirection rules; guided calendar and related-record selection; complete treatment/batch/output ledger; notifications and preference/delivery status; credits/refunds; richer reports and administration; reviewed private-file lifecycle; managed event fan-out.

### P2: expansion

Additional service areas, provider integrations, optimized dispatch, advanced analytics and separately verified environmental accounting. Automated treatment claims, purchased offsets, public marketplaces and AI-generated impact estimates are not baseline requirements.

## 5. Functional requirements and acceptance

### FR-01 — Identity and account lifecycle

- Support browser secure-cookie sessions and native short-lived credentials with rotating refresh families.
- New signup grants no membership. Provisioning must be reviewed; production must not bootstrap demo users.
- Required release controls: expiring invitations, verified delivery/reset workflow, administrator MFA enforcement, session/device revocation and audited membership changes.
- Acceptance: inactive membership denied immediately; refresh reuse revokes family; unauthorized cookie mutation rejected by Origin checks; no privilege escalation through a submitted role or organization ID.

### FR-02 — Public information and navigation

- Explain collection, accepted materials, business responsibilities, coverage and contact/request paths in plain language.
- Distinguish local demonstration from real deployment. Never advertise fictional partners as operating providers.
- Use supplied logo, responsive layouts, accessible ordinary links and restrained reduced-motion-compatible transitions.
- Public home must not load protected data, auth cache or dashboard chart bundles.
- Acceptance: 320–1920 px layout checks, keyboard navigation and serious/critical automated accessibility checks; screen-reader/device acceptance separately required.

### FR-03 — Site onboarding and commercial agreement

- Capture business category, contact, landmark/coverage, operating days, storage, baseline handling and expected quantity.
- Assess qualification and duplicates; outside-area requests must not silently activate.
- Issue expiring, currency-specific quotations with quantity/frequency basis, responsibilities, terms and structured local service windows.
- Customer acceptance creates a fixed agreement snapshot. Activation requires approved terms, training and valid weekdays.
- Acceptance: quote expiry blocks acceptance; activation cannot invent a time window, exceed accepted frequency or select non-operating days.

### FR-04 — Scheduling

- Generate dated occurrences from versioned recurring definitions and IANA timezone, independent of database session timezone.
- Respect inclusive subscription boundaries, approved pauses and area closures. Snapshot UTC window instants and local service date.
- Overnight windows cross local midnight; nonexistent DST times require review; overlap policy is explicit.
- Preserve generated dates; calendar edits cannot silently move work or regenerate cancellation. Reschedule by linked replacement with shared billing occurrence key.
- Acceptance: retries and parallel generation cannot duplicate dates; in-flight work blocks calendar cancellation; restoration requires eligibility and clears assignment; missed/failed history remains.

### FR-05 — Dispatch and collection

- Assign authorized route/collector/facility; track journey and arrival through validated state transitions.
- Store gross, tare and net integer grams, measurement basis/method, material, contamination and occurrence time.
- Recheck assignment/version/calendar when offline capture syncs. A rejected stale draft remains available for review rather than being represented as saved.
- Acceptance: collector cannot capture another collector's job; invalid mass or stale version rejected; collection alone never marks receiving/treatment complete.

### FR-06 — Manifest, handover and receiving

- Allocate source mass across delivery manifests with transaction locks and bounded conservation.
- Require explicit handover and independent receiving actor. Record received, accepted and rejected mass independently from source.
- Preserve discrepancies; review evidence separately from capture. Rejected mass starts a residual lifecycle requiring an authorized destination.
- Acceptance: two concurrent source splits cannot overspend; two facility users cannot double-receive; original collector measurement remains unchanged; unresolved residual destinations remain visible.

### FR-07 — Treatment and outputs

- Distinguish accepted feedstock, actual treatment, finished outputs, losses and residuals.
- Require authorized batch/input/output links, dates, measures and evidence. Do not infer completion from receiving.
- Acceptance: stage-specific totals never double-count transfers; processing/output claims require their own records. Full lifecycle UI and operational acceptance remain unfinished.

### FR-08 — Finance

- Maintain integer minor units with explicit currency and service periods. Never aggregate USD/LRD without an approved conversion basis.
- Invoice agreed service; customer payment-reference submission remains pending until independent finance review confirms funds.
- Guard allocations from overpayment/double application; corrections, credits/refunds and disputes require authorized lifecycle and audit.
- Acceptance: screenshot/reference alone leaves invoice unsettled; concurrent confirmations cannot double-credit; rescheduling does not create an automatic extra service charge.

### FR-09 — Complaints and exceptions

- Record site-linked complaint, description, responsible scope, resolution and follow-up.
- Preserve operational reasons and prior outcomes. Do not resolve discrepancies by overwriting measurements.
- Acceptance: customers see their own cases; resolution needs permitted actor and reason; unresolved work is visible on authorized dashboards.

### FR-10 — Dashboards, exports and updates

- Report active sites, scheduled/in-progress jobs, collected mass, independently accepted mass, reconciliation and service issues within actor scope.
- Render meaningful empty states from an empty database; no generated customer/payment/impact fixtures in production.
- Refresh active web/native queries every five seconds with authorized API reads; show last successful refresh and stale/error state. This is near-live polling, not instant push delivery.
- Managed push requires revocable scoped subscriptions, cross-tenant tests, reconnect/replay and complete affected-party fan-out before claiming delivery at all levels.
- Acceptance: fresh committed records appear after successful refresh; connection failure does not label cached values current; CSV and UI share authorization.

## 6. Data model and invariants

Canonical persistence is PostgreSQL with checksummed SQL migrations. Core concepts: users/sessions/native credentials; organizations/memberships; service areas/sites; assessments/quotes/agreements/training; subscriptions/schedule rules/versions/pauses/closures; jobs/routes; collections/manifests/allocations/receiving/reconciliation/residuals; processing records; invoices/payment evidence/allocations; complaints; files; audit and outbox.

Mass is integer grams; money is integer minor units. Store timezone-aware instants separately from local calendar dates. Commands require stable idempotency keys and optimistic entity versions where applicable. State transition, scope, audit and outbox writes occur transactionally. Evidence correction must append reviewed history rather than delete original facts.

## 7. Architecture and environments

- pnpm monorepo: React/Vite web, Expo/React Native mobile, Hono Node API, shared contracts/domain/design, Drizzle/PostgreSQL and Better Auth.
- Vercel serves static web and the shared API under `/api/v1`; Neon provides PostgreSQL, not automatic business authorization.
- Local demo remains isolated at localhost PostgreSQL. Production and schema-only preview use separate Neon branches and separate auth secrets/runtime passwords.
- Runtime database role has DML but no schema creation ownership. Migration-owner connection stays server-side and is not uploaded as a browser/native variable.
- Client variables may contain API URLs, public IDs and mode flags only. Database/password/storage/auth/provider secrets are never public variables or Git artifacts.
- Deploying does not itself approve operations. A production administrator identity, legal terms, service agreements, verified security controls and providers are launch prerequisites.

## 8. Non-functional requirements

Security: default-deny authorization, TLS verification, secure cookies, CSRF protection, durable abuse limits, bounded payloads/lists, private evidence storage, auditability and least privilege. Review dependency advisories and access logs before release.

Reliability: atomic commands, idempotency, retryable transaction conflicts, monitored scheduled work, bounded outbox retries/dead-letter review, honest cache/offline behavior and tested recovery.

Performance: preliminary constrained public budgets FCP ≤3 s and visible-heading confirmation ≤5 s under `PERFORMANCE.md` conditions. One local pass is not production acceptance. Define API latency and availability targets from measured staging load; no unobserved SLA is promised.

Accessibility: visible focus, stable field labels, announced server errors, focus restoration, accessible collapsed navigation, minimum touch targets and readable state colours. Automated checks do not replace keyboard/screen-reader/native device tests.

Privacy: restrict personal/contact/financial/evidence data by purpose and scope; establish retention, deletion/legal-hold and incident response policies before real customer use.

## 9. Quality and release criteria

Observed baseline before cloud connection: 55 unit/PostgreSQL tests across three files, full four-test browser suite, later focused three-test UI suite, web/native typechecks, web build and Android/iOS JS exports. These are historical observations; later changes need fresh validation.

Required release evidence: production/preview health and database isolation; actual authorized save/read persistence; security regression tests; invitation/reset/MFA controls; independent physical/finance review; stale/offline tests; secret scan; migration/recovery drill; performance sampling; scheduler/provider failure tests; signed device builds and operational training.

Release must be blocked by critical security failures, tenant leakage, conserved-mass/financial violations, fabricated reporting, unverified admin identity or missing recovery. `CHECKLIST.md`, `LIMITATIONS.md` and `TEST-RESULTS.md` record observed—not aspirational—completion.

## 10. Metrics

Track scheduled service completion, missed/failed cases, capture-to-receiving lag, unresolved reconciliation, residual destination backlog, invoice ageing by currency, payment-review age, complaint resolution age, unauthorized request attempts, scheduler success and update staleness. Denominators, date ranges and evidence limitations must be visible. Environmental metrics remain disabled until an approved method and independently supported data exist.

## 11. Dependencies, risks and open decisions

- Owner must nominate production administrator email/name; do not infer it from a CLI or Git account.
- Operating coverage, customer/provider agreements, authorized materials/residual destinations and live pricing need approval.
- Mail/private storage/push/event provider accounts and credentials are not automatically provisioned by a database deployment.
- Neon free plan capacity/retention, Vercel commercial-use eligibility, serverless duration and scheduler cadence must match actual operation; no paid upgrade is implied.
- Preview is a shared isolated branch, not automatic per-PR isolation. Do not reset it from production after real personal data exists without a reviewed policy.
- Polling freshness depends on network, foreground lifecycle, database wake-up and successful authorization. Instant push and mobile background delivery are not guaranteed.
- Full financial adjustments, reviewed corrections, capacity planning and remaining P1 modules need dedicated acceptance before general rollout.

## 12. Handover

Source: requested `itconsultantbryant-svg/egrth` repository. Deployment settings and private env locations are documented in `DEPLOYMENT.md`; safe templates contain no real secrets. Preserve original branding. Production has no fictional operational seed. Signed app-store publication, paid purchases and service launch approval are separate decisions.

## 13. Public website revision — 9 November 2026

- Assessment must be accessible without login or signup and must not create an account automatically. Store consented contact/business/location/service details as a lead, return a reference and let authorized platform staff contact the requester.
- Provide a separate public contact workflow with topic/contact preference, and an authorized enquiry inbox with status, private notes, concurrency checks and audit history. Do not expose leads to unrelated operational or customer roles.
- Include Services and Team pages, contextual original African-led illustrations across information pages, three controlled homepage slides, customer-sector descriptions, FAQ, responsive public navigation and a standard multi-column footer.
- Illustrative people/industries must not be described as actual customers, staff portraits or endorsements. No invented contact numbers, office locations, testimonials or partner agreements.
- Newsletter requires separate optional consent, deduplication, private unsubscribe handling and admin-only consent visibility. No delivery/verification claim before a mailing provider and reviewed policy exist.
- Acceptance covers anonymous submission, no accidental membership/site creation, durable abuse limits, safe retries, admin follow-up/audit, role denials, responsive layouts, carousel keyboard/pause/reduced-motion behavior and public-page accessibility. Implementation details and current limitations: `PUBLIC-WEBSITE.md`.

## 14. Administrator-provisioned accounts

Platform administrators must create named user accounts, give them unique usernames and temporary passwords, and assign organization-specific roles. They can restrict View/Manage functions within the role's maximum permissions; they cannot bypass tenant boundaries or independent receiving/finance duties with arbitrary grants. Explicit membership additions support legitimate multiple-organization work.

Temporary passwords must be changed before accessing service data. Credential reset and account disabling revoke browser/native sessions; account/membership access must be checked on subsequent API requests. Users must be able to sign in by username or email and use assigned operational workflows, subject to site/assignment/state requirements. UI refresh uses explicit five-second authorized polling, not a false instant-push guarantee.

Account creation, role/restriction changes, reset, disable and self-password changes must be audited without plaintext passwords. Enforce bounded forms, maintained password hashing, reason/version checks, transaction-safe creation/retry, proper role/organization compatibility and self/last-admin lockout protection. Existing accounts retain email login and are not silently reset by migration. Operator instructions, endpoint contract and remaining MFA/mail/device requirements: `USER-ADMINISTRATION.md`.
