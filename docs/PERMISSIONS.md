# Authorization matrix

Canonical executable matrix: `packages/domain/src/index.ts` (`grants`). Default deny. `apps/api/src/access.ts` supplies shared object/list/export SQL scopes. Each action also enforces workflow-specific permissions, current version and state. Client navigation is convenience, never authorization.

| Role | Scope | Permitted operational writes | Financial access |
|---|---|---|---|
| PLATFORM_ADMIN | Platform membership in PLATFORM organization; explicit customer membership stays customer-scoped | Assess, quote, activate, schedule, assign, review receiving, destinations, resolve complaints. Cannot impersonate assigned collector/facility receiver or erase audit/evidence. | Invoice and independent review; no self-review |
| OPERATIONS_MANAGER | Platform organization | Onboarding, scheduling, assignment, reconciliation, destinations, complaints | None |
| FINANCE_OFFICER | Platform organization | No capture/receiving | Issue invoice, submit or independently review payment; not own evidence |
| READ_ONLY_REVIEWER | Approved platform scope | None | Read/export approved resources only |
| CUSTOMER_OWNER | Explicit customer membership | Request own site, accept own quote, submit reference, complaints | Own organization invoices/payments only |
| CUSTOMER_STAFF | Explicit customer membership | Own complaints | None |
| PARTNER_DISPATCHER | Partner organization assignments | Assigned jobs/routes/manifests | Own partner payables read; management not complete |
| COLLECTOR | Only personally assigned jobs; personally dispatched manifests | Start/arrive/capture own job, exceptions, allocate owned collections, handover | None |
| FACILITY_MANAGER | Destination facility organization | Receiving, reconciliation by a different reviewer, residual completion | None |
| RECEIVING_OFFICER | Destination facility organization | Independently receive delivered manifest; never change collector mass | None |

Membership header is a **membership record ID**, not an arbitrary organization assertion. The server verifies ownership and active status. Elevated scope requires both a privileged role and PLATFORM organization kind. Admin acting as customer owner cannot retain platform-wide query scope.

Lists, single-object access and CSV use the same scope builder. Attachments are **strictly owner-organization scoped** even for platform users; cross-organization review/download needs a dedicated audited grant and is not released. No live subscription tokens are issued while the authorized subscription adapter remains inactive.

Sensitive actions require reason and audit. Audit updates/deletes are prohibited at the database layer. Site/ledger/physical evidence has no deletion API. Full role-change/invitation/export approval management, admin MFA enforcement and fine-grained multi-site teams remain release blockers; do not invite production users yet.
