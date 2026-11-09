# Five-site pilot walkthrough

Local demo only. Every named business/provider is fictional. The seeded proof references are labelled demo strings, **not verified private uploads**. No real payment/collection/composting event occurred.

## What the seed actually executed

`packages/db/src/seed.ts` calls the same validated command service as the HTTP API. It does not just fill dashboard cards.

1. Five customer organizations and explicit owner memberships: Palm Kitchen, Atlantic Table, Mango & Millet Café, Sinkor Garden Hotel and Pepper Pot Eatery.
2. Request → qualified assessment → issued quotation → customer-owner snapshot acceptance → training/approval → subscription and recurring schedule.
3. Generate current dated occurrences idempotently; assign the fictional Sinkor route and collector.
4. Four assigned jobs: EN_ROUTE → ARRIVED → COLLECTED; three measured, one explicitly estimated. Fifth job MISSED with reason.
5. Allocate 110 kg pickup mass into one dispatched/delivered manifest. An independent facility receiving officer records 108 kg received: 103 kg accepted / 5 kg rejected.
6. A −2 kg discrepancy and open reconciliation case remain visible. Five kilograms of rejected residuals have no authorized completion destination yet. Neither is silently closed.
7. Five USD invoices: $200 issued in total, $40 confirmed allocation, $160 outstanding. Another $40 payment reference is pending and **does not reduce the balance**.
8. One open missed-service complaint. A CREATED batch is unallocated; no treatment/output/compost quality claim.

## Review in web

1. Start API/web per README; open `/login` as `admin@demo.ecogrowth.test` using the local demo password. Default verified membership is platform admin, unless a previously selected valid membership is remembered.
2. Overview shows only API-derived values, scope, last refresh, explicit five-second polling and stage definitions. Do not add 110 + 103 + 5 as recovery.
3. Customers & sites → Details exposes actual UUIDs. Routes & assignments and Users & access expose identifiers used by the basic assignment forms.
4. Deliveries → Receiving → Reconciliation shows the independent records. Platform operations can review the case with a reason; receiver self-review is prohibited. Residuals remain pending until actual authorized destination evidence is recorded.
5. Invoices and Payments show confirmed versus pending. Finance review requires another actor than the submitter and a settlement basis. Never confirm real funds merely to make a chart green.
6. Switch organization/role in the topbar to Palm Kitchen customer owner. Only that customer's site, invoice and permitted service sections are visible. Switch back explicitly for administration.
7. Sign in as `collector@demo.ecogrowth.test` to view personally assigned jobs/history/handovers. `receiver@demo.ecogrowth.test` sees the destination facility scope; neither sees customer payment ledgers.

The seeded jobs already contain physical evidence, so they cannot be rewritten to replay a collection. To try new capture workflows, generate a new eligible service date and assign a new occurrence; never reset existing evidence. Seed reruns are no-op after initialization.

## Native

Configure reachable API origin, use the same accounts and explicit membership switching. More exposes role-permitted sections. Native admin has the implemented web workflow forms, rendered with native controls, and the same incomplete module labels. Collector Sync Queue supports local collection drafts but needs a SQLCipher-capable native build and device acceptance tests; Expo Go is not the release artifact.

## Observed coverage boundaries

The seed exercised the above command sequence against PostgreSQL. A later real browser/API/PostgreSQL test additionally exercised operational forms from a fresh isolated site request through receiving/reconciliation, invoice/payment confirmation and complaint resolution, without modifying the five-site developer demo. That test deliberately leaves residual destination pending and does not claim a completed batch/output flow. Native exports bundle both platforms but do not validate device/offline/camera/screen-reader behavior. See `TEST-RESULTS.md` and `LIMITATIONS.md`.
