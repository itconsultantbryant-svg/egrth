# Reproducible public-shell checks

With API running on 3001, build and start production preview on 4173:

```sh
pnpm build
pnpm --filter @ecogrowth/web preview --port 4173
# Another terminal, using an installed supported Chrome where required:
node tests/check-production.mjs
```

Conditions: fresh browser context, 375×812 viewport, browser cache disabled, 150 ms network latency, 200,000 bytes/sec download (1.6 Mbps), 75,000 bytes/sec upload (0.6 Mbps), 4× CPU throttle. Vite preview is a local production bundle server, **not an observed compressed CDN deployment**. Host load affects results; no production percentile or SLA is inferred from one run.

Budgets chosen for engineering review: first contentful paint ≤3,000 ms, visible public-heading confirmation ≤5,000 ms. The script logs browser paint timings from navigation start and automation-visible heading elapsed time from navigation commit. It removes throttling only **after** measuring that first view, before cache/security checks. Exit status fails if the measured performance budget is missed, even when cache/security assertions pass.

## Implemented optimizations

- Public homepage does not import auth, domain ledgers, protected query caches or operational forms. Authenticated/public-inner routes load through a lazy application shell; chart code is separately lazy.
- Public-only HTML is prerendered at build time through React's server renderer. Build script imports no API/database/auth state. The production homepage has no stateful controls, so it remains static with ordinary accessible links and does not load or hydrate React. Development mode and application routes load the full React runtime; non-home SPA routes clear the public markup and render their own shell.
- Supplied original logo preserved. Public image is resized/optimized; square PWA/native icons derive from its symbol. No remote/unlicensed marketing image is downloaded.
- Current critical public bootstrap **3.18 kB raw / 1.48 kB gzip**, deferred React/main runtime ~258 kB / 83 kB gzip, deferred application shell ~201 kB / 65 kB gzip, chart ~369 kB / 106 kB gzip; inspect the actual latest build output for exact values. Shared CSS ~35 kB / 8 kB gzip. No stateful homepage behavior is withheld behind hydration; links work without that runtime.
- Test verifies initial homepage does **not** request main React runtime, ApplicationShell or ReportChart.

## Observed limitations

Single constrained runs have varied substantially: 4,074 ms in an early baseline; 17,023 ms in a later run; 5,019 ms after route splitting; 8,541 ms and 11,148 ms in later public-prerender runs. Latest recorded browser FCP was 5,552 ms. Measurements before prerender used a DOMContentLoaded wait; newer measurements start from navigation commit and include explicit paint data, so these are **not a controlled percentage-improvement series**. Bundle reduction is measured; latency improvement is not statistically established.

After moving runtime startup off the static homepage, the latest constrained run **passed the preliminary local budgets**: visible-heading confirmation **3,802 ms**, FCP **1,872 ms**, first paint **1,336 ms**. Functional cache/offline/lazy-login checks also passed; no main React runtime, authenticated shell or chart was requested for home. This is an observed single run after a concrete architecture change, **not** a production percentile/SLA.

The deployment/multi-run performance release gate remains **open**. Do not cherry-pick the best local run, equate static HTML with app-route interactivity, or promise deployment performance. Recheck on a controlled host and actual preview/staging deployment with observed compression, multiple cold runs and mobile hardware/network profiling.

Functional cache tests are separate: only `/offline.html` is cached; protected API GET is not cached; offline navigation gives an honest unconfirmed/offline page; valid 192/512 icons exist; lazy `/login` renders without retaining prerendered homepage markup. Passing these checks is not a performance pass, signed mobile build or full PWA/device installation acceptance.
