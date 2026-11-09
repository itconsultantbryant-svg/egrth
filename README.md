# EcoGrowth Liberia

Web + native + shared Node API and PostgreSQL foundation. **Not a verified production release.** See [phase checklist](docs/CHECKLIST.md), [test results](docs/TEST-RESULTS.md) and [limitations](docs/LIMITATIONS.md).

The supplied EcoGrowth logo is preserved in `assets/`; forest/emerald tokens are shared between web and native. All seeded organizations, businesses, providers, payments and physical records are explicitly fictional. Emissions estimation, carbon claims, compost sales and payment providers are disabled.

## Local setup

Node 24 LTS and PostgreSQL 15+ are required. The repository's pnpm workspace/lockfile is canonical. Do not mix npm and pnpm installation trees.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Set DATABASE_URL, MIGRATION_DATABASE_URL, BETTER_AUTH_SECRET and DEMO_SEED_PASSWORD locally.
pnpm db:migrate
pnpm db:seed
pnpm dev:api
# In another terminal:
pnpm dev
```

Web: http://localhost:5173 · API: http://localhost:3001/api/v1 · contract: `/api/v1/openapi.json`.

For the initialized local workspace, `.env` is ignored and targets the isolated PostgreSQL process on `127.0.0.1:55432`. The `ecogrowth_dev` database was used only for SQL migration smoke testing; `ecogrowth_pilot` is the canonical application/demo database. Neither is Neon production.

Demo users: `admin`, `operations`, `finance`, `reviewer`, `collector`, `dispatcher`, `receiver`, `facility`, `staff`, `customer1` … `customer5`, each `@demo.ecogrowth.test`. Password: local `DEMO_SEED_PASSWORD`. Signup deliberately grants **no membership**. Demo admin has explicit additional customer-owner memberships for scope switching; email never grants membership.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm --filter @ecogrowth/mobile exec expo install --check
pnpm --filter @ecogrowth/mobile start
```

## Native

React Native primitives, Expo Router, accessible labels and scalable text; native `StyleSheet` uses shared tokens, not web DOM/Tailwind components. Both clients use the same command contracts, roles and canonical PostgreSQL API. Configure `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` for the device's reachable API host (not device localhost). Never prefix server secrets with `EXPO_PUBLIC_` or `VITE_`.

Offline collection drafts use SQLCipher-enabled Expo SQLite and a SecureStore-held database key. **Use a development/internal build, not Expo Go**, to exercise that path. Credentials are stored in SecureStore; API access credentials expire after ten minutes and refresh rotates. See [native tests/build instructions](docs/MOBILE.md). No signed binary or device validation is implied by source or Metro export.

## Layout

- `apps/web`: public website, secure role workspace, operational forms, stage reports and safe PWA offline shell.
- Public `/` is React-rendered at build time and uses ordinary links without loading auth/React runtime; app routes load the full React client lazily. See `docs/PERFORMANCE.md` for actual measurements and remaining gates.
- `apps/mobile`: native dashboard, scoped navigation/records/workflows and collector queue foundation.
- `apps/api`: Node/Hono API, Better Auth, object scopes, transactional commands, private-file/outbox adapters.
- `packages/db`: PostgreSQL SQL migration, Drizzle transactions and demo command-driven seed.
- `packages/contracts`, `domain`, `design-tokens`: validation, permissions, workflows, arithmetic and branding.
- `api/index.ts`, `vercel.json`: Vercel routing and explicitly bundled Node API deployment.

Cloud deployment was authorized: Neon production/preview branches and Vercel project are provisioned. Production: https://egrth.vercel.app . This is not operational release approval; administrator provisioning and remaining security/workflow requirements are pending. No paid provider purchase or store publication was performed.

See [deployment/env handover](docs/DEPLOYMENT.md) and [full product requirements](docs/PRD.md). Private environment values are in ignored `.local/deployment/` files, never this repository.

Scheduling policy and operator controls: `docs/SCHEDULING.md`. The production-preview check records explicit performance budgets separately from cache/security correctness:

```sh
node tests/check-production.mjs
node tests/check-client-secrets.mjs apps/web/dist apps/mobile/dist
```
