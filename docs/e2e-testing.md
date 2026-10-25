# End-to-end testing (Playwright)

```bash
npx playwright install chromium   # once
npm run test:e2e                  # builds and serves two production builds, runs all suites
npm run test:e2e:report           # open the HTML report
E2E_ALL_BROWSERS=1 npm run test:e2e   # also Firefox and WebKit (secondary targets)
```

## How the environments are isolated

`playwright.config.ts` starts two **production** builds, each with its own `distDir`:

| Project | Port | Supabase | Used for |
|---|---|---|---|
| `local` | 3300 | not configured (env vars forced empty) | public demo, browser-only workspace journeys |
| `gated` | 3301 | configured with an **unreachable placeholder** URL and key | middleware redirects, API refusals, auth error handling, redirect safety |

Neither build can reach a real database, so the suites can never touch production data. Each test gets a fresh browser context, which means an empty local workspace. Diagnostics: a trace on retry, plus a screenshot and video on failure, and an HTML report (uploaded as a CI artifact on failure).

## Suites (Sprint 1, all passing: 22 tests, Chromium)

| File | Covers |
|---|---|
| `e2e/demo/public-demo.spec.ts` | health API; public pages render; guided demo reproduces the gender fixture (25/100 vs 40/100, 0.63×) and the nationality fixture (17/69 vs 45/120, 0.66×) |
| `e2e/audits/audit-journey.spec.ts` | Data Hub import → map → validate → commit → audit (ratio 0.625) → re-run & verify → investigation → report → checksum verify → JSON download with the same figures; Read-only cannot import |
| `e2e/workflows/approval-gate.spec.ts` | multi-agent workflow stops at the gate; the initiator's approval is refused with nothing recorded; a Reviewer approves; the run completes and is linked to the Audit Lab |
| `e2e/security/auth-gate.spec.ts` | 8 workspace routes redirect signed-out users; 7 private API calls return 401 via direct HTTP; a forged approval with a spoofed reviewer is refused; auth outage shown honestly; `/auth/callback` with invalid codes and off-site `next` values stays on-site; the local-demo cookie unlocks no server data |

## Not yet covered: needs a disposable Supabase project

The brief's authenticated scenarios still need a real Auth server. That covers registration, email confirmation, magic link, password recovery, session expiry, organisation creation, invitations, cross-tenant browsing, MFA and role changes. Docker isn't available on the current development machine, so a local `supabase start` isn't possible there.

Plan for Sprint 2:

1. Create a **separate** Supabase project for tests (never the production one) and run `supabase/migrations/*` there.
2. Provide `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` and `E2E_SUPABASE_SERVICE_ROLE_KEY` as CI secrets. The service-role key is used **only by the test harness**, to create confirmed users and generate magic-link or recovery links through the Admin API (`auth.admin.generateLink`). That avoids real inboxes and fixed sleeps. The app itself still never sees a service-role key.
3. Add a third Playwright project (`cloud`) that builds against that project and is skipped unless those variables are set.

Until then, tenant isolation and approval rules are verified at the database level by `tests/rls.test.ts`, which runs the real migration on Postgres via PGlite, and at the service level by `tests/cloud.test.ts`.
