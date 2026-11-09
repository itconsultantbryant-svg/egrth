# Administrator user and permission management

## Operator guide

Open **Users & access** at `/app/users` while signed in with an active PLATFORM_ADMIN membership in a PLATFORM organization.

1. Select **Create user** and enter the person's name, email and unique username.
2. Choose a role and an active organization. If appropriate, create a new organization in the same transaction; its type follows the selected role. Creating a record does not approve a collection partner, facility, service area or commercial agreement.
3. Review the role's View/Manage permission matrix. Uncheck functions to restrict this membership; this never grants authority outside the selected role. Removing View also blocks Manage. Platform administrators must retain Users access.
4. Generate a strong temporary password, or supply one of 12–128 characters. Record a non-secret reason and create the account.
5. Share the displayed username, temporary password and `/login` URL privately. No credential email is sent. The password is held only in the current screen's memory; closing the receipt discards it. It is not retrievable from account lists, audit or replay records.
6. At first sign-in the person must choose a new private password before the API allows access to service records. All temporary-password sessions are revoked; they sign in again with their own password.

Existing accounts can receive additional explicit organization/role memberships. Edit a membership to change its role, restrictions or enabled state. The role must match the organization's kind: platform roles → PLATFORM; customer roles → CUSTOMER; collector/dispatcher → PARTNER; receiving/facility roles → FACILITY. Roles are not silently combined; the user selects one membership context at a time.

**Reset password** assigns a new temporary password, requires a fresh private password and revokes all browser/native sessions. **Disable account** blocks the user across all organizations and revokes sessions; **Enable account** restores sign-in, not inactive memberships. Historical operations and audit records are not deleted. Administrators cannot disable, demote or modify their own memberships; another administrator must review their access. They can change their own password through `/change-password`.

All privileged changes require a reason, are audited and use version checks where editing existing records. Refresh after a concurrent-change conflict. Creation is idempotent with a stable request key, so retrying the exact same creation does not create duplicate accounts.

## Permissions and updates

- Role grants remain the maximum permission set. Per-membership deny lists restrict those grants; they are not arbitrary additive permissions or a way around physical/financial separation rules.
- The API reads active membership/organization/account state on each request. A role or restriction change applies to subsequent requests even if the browser has not yet refreshed.
- Account disable and password reset expire sessions and revoke rotating native credentials. Membership-only changes keep sign-in but alter permitted functions on subsequent API requests.
- Web and native session queries refresh every five seconds. Web navigation and native menu/job access use current membership restrictions; protected query caches are removed when the session/access fingerprint changes.
- Commands recheck their primary permission before idempotency replay, so replay cannot bypass a revoked action permission. Object/tenant constraints, assigned collector checks, accepted materials and workflow state still apply.
- Five-second foreground polling is near-live, not push. Network errors, app suspension and device offline state can delay screen changes. In-flight requests are not retroactively cancelled, nor are previously viewed/copied records remotely erased.

## Credentials and storage

Username is unique, case-normalized and 3–40 characters (`a-z`, digits, dots, underscores, hyphens; first character alphanumeric). Existing users with no username can continue using email. New-user and administrator-reset credentials are hashed with Better Auth's maintained password implementation; no plaintext password is stored in source, database profile, audit or idempotency response.

Creation fingerprints use keyed HMAC rather than an unkeyed password-containing digest. Only a salted maintained credential hash is stored in `account.password`. Administrator reset and self-change do not preserve or display old passwords. All own-password changes require the current password and revoke existing web/native sessions.

Email/username sign-in is forwarded through Better Auth's existing credential, rate-limit and MFA path. Disabled users cannot receive a usable application identity; session creation also checks disabled state. No email verification or MFA status is fabricated during provisioning.

## API surface

| Endpoint | Purpose |
|---|---|
| POST `/api/v1/auth/sign-in/identifier` | Email or username credential login |
| POST `/api/v1/auth/credentials/change` | Current user changes password; no membership required; current password and allowed cookie Origin required |
| GET `/api/v1/admin/options` | Active organization choices and built-in role permission definitions, bounded to 500 organizations |
| GET `/api/v1/admin/users?search=&offset=` | Administrator account/membership list, 25 accounts per page, no password hashes |
| POST `/api/v1/admin/users` | Atomic account/credential/membership creation, optionally organization creation |
| POST `/api/v1/admin/users/:id/memberships` | Add explicit organization access |
| POST `/api/v1/admin/memberships/:id` | Versioned role, restriction and membership-state edit |
| POST `/api/v1/admin/users/:id/state` | Versioned global disable/enable |
| POST `/api/v1/admin/users/:id/password` | Versioned administrator temporary-password reset |

Administrator routes require current platform-administrator authorization, valid membership and cookie Origin where applicable. A transaction advisory lock serializes changes and revalidates the initiating administrator after waiting, preventing a stale administrator request from applying after their access changes. Self-lockout and last-active-administrator guards protect administration access.

Migration `0008_user_administration.sql` adds optional usernames, disabled/temporary-password/access-version fields and membership version/permission restriction fields. Existing accounts keep their passwords and email login; no forced reset or role change is applied to them by migration. No real customer/staff account is created merely by deploying this feature.

## Limits and release requirements

- User-management editing is provided in the web admin workspace; native users can sign in by username, change temporary passwords and perform their authorized functions. Native source checks/exports are not signed builds or device acceptance.
- Invitations with expiry, verified-email policy, password-reset mail, administrator MFA verification/enforcement and detailed session/device inventory remain unfinished. MFA-enabled accounts must not be presented as fully supported by a missing challenge screen.
- No credential email/SMS delivery, campaign provider, instant push or automatic role escalation is claimed.
- Some operational modules remain read-only/incomplete. Granting a role does not implement missing batch, financial-adjustment, facility/vehicle or other workflows; see `LIMITATIONS.md`.
- Full organization approval/editing is not part of this screen. Passwords shared in conversation or insecure channels must be changed before real operation.
