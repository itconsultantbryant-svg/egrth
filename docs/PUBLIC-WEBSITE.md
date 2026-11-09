# Public website and enquiry workflow

## Design

Warm ivory, forest green and muted ochre public design with editorial headings, responsive navigation, illustrated service scenes, customer-sector cards, process guidance, FAQ and a full multi-column footer. The supplied EcoGrowth logo is unchanged.

The home hero has three independently selectable slides: kitchen separation, collection crew and independent receiving. Autoplay pauses on hover, keyboard focus, hidden tabs and user selection. A pause/play control is available. Reduced-motion users start with autoplay paused. All controls have accessible names and static content remains usable if scripts fail.

Original SVG illustrations show fictional Black African people, not real employees, customers or facilities. `scripts/generate-public-art.mjs` reproducibly creates the five service/community illustrations in `apps/web/public/images/`. No external photo licence, paid generation provider or fabricated customer endorsement is implied. Photorealistic generated images were not produced; no image-generation tool was available.

## Pages

Home, Services, How it works, Accepted materials, Who we serve, Partners, Service areas, Team, Contact, Site assessment, Privacy, Terms and Newsletter preferences. Public information pages each have contextual illustrations. The Team page explains actual operational responsibilities and the verified administrator nomination, not invented biographies or generated staff headshots. Public phone, office address and opening hours are not fabricated.

Production home remains prerendered React HTML with a small framework-free carousel/form interaction module; it does not load protected auth/query/chart code. Other public routes render in React without requiring an account. Public form handling uses delegated events on both static and React pages.

## No-account assessment and contact

`/quote-request` now displays the public assessment form, not a redirect to login. Required assessment inputs: name, email, business name, location/landmark, service interest, message and explicit enquiry consent. Phone, sector and contact preference are available; choosing phone requires a usable number. Contact form includes topic selection, optional business/location and the same consent boundary.

Successful submission returns a reference and a server-confirmed saved status. A timeout is unconfirmed, not success; retry preserves the submission key. Requests do not create users, memberships, customers, sites, quotations, service dates or invoices. No automatic email acknowledgement is claimed.

`POST /api/v1/public/enquiries` validates a bounded schema, checks exact allowed website Origin, rejects the honeypot and uses a durable public submission limit (12 requests/hour per hashed network bucket). In Vercel only its platform IP header is trusted; arbitrary forwarded-for is ignored locally. Raw IP addresses are not persisted. Old limiter buckets are cleaned in bounded awaited batches. This is baseline abuse protection, not a claim of bot-proof CAPTCHA/edge-WAF protection.

Idempotent key/body hashing prevents duplicate retries and rejects key reuse with changed details. No public list or reference-based contact lookup exists. The consent time is persisted with the request.

## Administrator workflow

Platform administrator and platform operations have Website enquiries navigation at `/app/enquiries`, with five-second authorized polling, search, bounded paging, full request details, email/call links and private follow-up notes. Statuses: NEW, CONTACTED, CLOSED. Updates use entity-version checks and append audit entries including previous status/notes. Email/call links open the operator's tools; clicking them is not proof that contact happened.

Customer/partner/facility roles and the read-only reviewer are denied this lead inbox; it contains prospective-customer contact data, not a shared operational ledger. API scope rules also apply to details and exports.

## Newsletter

Separate optional consent records are saved by `POST /api/v1/public/newsletter`; duplicate emails do not create additional rows or rotate existing unsubscribe credentials. Every response has the same generic shape, with a random token; only a newly inserted subscription receives a valid token for that new row. Existing subscriptions must use their original link or contact support. Unsubscribed addresses are not silently reactivated.

The private unsubscribe link is displayed on-screen for a new subscriber to save. Its token is in the URL fragment, not sent as a query string; the preferences page removes the fragment after reading it and unsubscribes only on explicit form submission. Tokens are stored hashed in PostgreSQL and excluded from administrator list output. Invalid/unknown tokens receive a generic outcome, not email enumeration.

Only platform administrators can view newsletter consent records at `/app/newsletter`. No mailing provider, welcome email, double opt-in verification, campaigns or scheduled delivery is configured. Do not begin marketing delivery until provider setup, address verification, reviewed privacy/retention policy and delivery-time unsubscribe handling are complete.

## Database and release

Migration `0007_public_enquiries.sql` adds enquiries, newsletter subscriptions and public form limits. Existing checksummed migrations are unchanged. Runtime DML grants follow the reviewed migration-owner defaults; no migration credentials belong in client bundles.

Both Neon branches received migration 0007. Preview's original schema-only clone was baselined first by comparing columns, constraints, indexes and triggers with production and copying only six migration ledger rows. One equivalent CHECK expression differed only by AND parenthesis grouping after schema clone; only that specific known expression was normalized for comparison. No operational data was copied to preview.

Release evidence and failures are in `TEST-RESULTS.md`; old performance figures are not automatically acceptance results for this redesigned site. Remaining full-platform security/operating blockers in `LIMITATIONS.md` still apply.
