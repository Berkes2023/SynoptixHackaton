# DeepTrace 2.0

*SynoptixHackaton submission.* Live: https://deeptrace-vert.vercel.app

**Trace the decision. Detect the bias. Strengthen accountability.**

DeepTrace independently examines AI-assisted recruitment outcomes recorded by an ATS, flags potential fairness risks, supports human investigation and produces reproducible evidence. It is **read-only** with respect to any ATS and **never determines whether unlawful discrimination occurred**. All public data is synthetic; there is no partnership with or integration from Workday.

## What's here

**Public site** (`src/app/(marketing)`): homepage (14 sections, live mini-audit), mega menu with keyboard support and a mobile drawer, `/platform`, `/solutions/hr` (case study computed live) plus four persona pages, `/research` (searchable, source-verified library), `/methodology`, `/responsible-ai`, `/security` (honest control register), `/privacy`, `/about`, `/contact` (server-validated, rate-limited, honeypot) and `/demo` (10-step guided audit, no sign-up).

**Workspace** (`src/app/(app)`, `noindex`): Overview with onboarding, Data Hub (CSV/JSON, drag-and-drop, mapping, validation, synthetic generator, Admin deletion), Jobs, Audit Lab, Counterfactual Testing Studio, Investigation Centre (5 statuses, evidence references, required rationale, event history), executive Reports (cover page, chart, recommendations, versions, checksum) and Bias Drift. Also: ⌘K / Ctrl+K command palette, breadcrumbs, light/dark/system theme, demo RBAC roles.

**Engine** (`src/lib/fairness`): deterministic and tested. Wilson CIs, impact ratio with Katz CI, Fisher exact, Mann–Whitney U, Holm correction, suppression, missingness, plain-English explanations per finding, drift by month or scoring version, and counterfactual pairs.

**Data** (`src/lib/data`): deterministic Workday-*style* sample export, a native generator (100/250/500/1,000 candidates × 4 job categories × 6 scenarios, CSV/JSON), and a 60-CV pack derived from [jsonresume-fake](https://github.com/jsonresume/jsonresume-fake) (Unlicense, identifiers removed).

**Research claims** live only in `src/lib/site/research.ts`, each checked against its primary source (Oct 2026). **Security status** lives only in `src/lib/site/security-controls.ts`.

## Fixture

`REQ-1042 Software Engineer`, initial screening: Male 40/100 vs Female 25/100 → impact ratio **0.625** (95% CI 0.41–0.95), Fisher p = 0.034. All marketing copy that depends on significance is computed from the engine, never hard-coded.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 73 Vitest tests (statistics, engine rules, generator, drift, API, security)
npm run typecheck
npm run build
```

Optional env var: `CONTACT_WEBHOOK_URL` (https endpoint, e.g. a Formspree form). Without it the contact API returns 503 and the form says the message was **not** sent.

## Known gaps (see `/security` and `docs/architecture.md`)

No real authentication, tenant isolation or server storage yet; the workspace lives in each visitor's browser. No Playwright E2E or automated accessibility suite yet. CSP still needs `'unsafe-inline'` for scripts.
