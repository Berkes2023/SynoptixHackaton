# DeepTrace 3.1 — verified baseline (Sprint 0)

Date: 2026-10-25 · Baseline commit: `b666d32` on `main` · Work branch: `feature/deeptrace-3.1`

## Verified environment

| Check | Result |
|---|---|
| Node | 24.22.1 locally; CI uses Node 22 |
| `npm run typecheck` | Pass |
| `npm test` (Vitest) | **118 / 118 pass, 10 files**: the reported baseline is confirmed |
| `npm run build` | Pass (35 routes; middleware 95 kB) |
| Lint | **Not configured at baseline.** There was no ESLint config or `lint` script. Added in Sprint 1; one real issue fixed (unescaped `'` in JSX) |
| Production | `deeptrace-vert.vercel.app`, Supabase project connected (accounts mode). Verified: `/api/v1/session` → `configured: true`, `/dashboard` → 307 to `/login`, sign-in reaches Supabase Auth |
| Docker / local Supabase | **Not available on the development machine.** The authenticated E2E suites need a disposable Supabase project (see `docs/e2e-testing.md`) |

No production data was read or modified during this audit.

## Architecture (as found)

```
Browser ──► Next.js 15 on Vercel
             ├─ (marketing)  public, indexed
             ├─ (app)        workspace; StoreProvider chooses:
             │     • local mode  → localStorage (synthetic demo, no server data)
             │     • cloud mode  → /api/v1/workspace (Supabase, RLS)
             ├─ (auth)       /login, /onboarding, /auth/callback
             ├─ middleware   refreshes the Supabase session; gates workspace routes
             └─ /api/v1/*    route handlers acting as the signed-in user (anon key + JWT)
                    │
                    ▼
             Supabase Postgres: organisations, memberships, invitations, workspaces
             (one JSON document per org), workflows, audit_events. RLS on every table,
             approval-gate triggers, append-only events. No service-role key anywhere.
```

- **Fairness engine** (`src/lib/fairness`): deterministic and pure; it runs in the browser and in tests.
- **Agents** (`src/lib/agents`): 8 deterministic services and an orchestrator with an allow-listed state machine. In cloud mode they run inside the API request (`src/lib/server/workflow-service.ts`). Total execution is milliseconds, but nothing is durable.
- **Workflow states**: `CREATED → VALIDATING → PLANNING → ANALYSING → EXPERIMENTING → VERIFYING → AWAITING_REVIEW → REPORTING → COMPLETED`, plus `FAILED` and `CANCELLED`.

## Security findings

New findings from this review are marked **NEW**.

| # | Finding | Severity | Status / plan |
|---|---|---|---|
| 1 | **NEW: audit results and report checksums are computed in the browser and stored in the org's workspace document.** In cloud mode, a malicious Admin/Auditor inside their *own* organisation could store fabricated metrics or edit a past report. RLS stops other tenants, not insiders. | High (integrity) | Sprint 3/4: recompute audits server-side from stored records on write (or in the worker); move reports to an append-only table with server-computed checksums |
| 2 | **NEW: historical records are mutable.** Audits, findings and reports live in one JSON document that Admins/Auditors can overwrite (deletion is Admin-only, but edits are not blocked per item). This conflicts with "do not overwrite historical audit records". | High | Sprint 3: per-item immutability check in `checkWrite`, then separate append-only tables |
| 3 | **NEW: `/api/v1/events` accepts client-chosen action names.** Entries are truthfully attributed to the caller, but the caller can log actions that never happened (e.g. `report.downloaded`). | Medium | Sprint 3: restrict to an allow-list of client-reportable actions; server-side actions are already logged by the server |
| 4 | **NEW: investigation sign-off names (`closedBy`) are client-supplied.** The role check is server-side, but the name is not. | Medium | Sprint 3: stamp `closedBy` on the server from the session |
| 5 | **NEW: invitations never expire.** | Medium | Sprint 2: `expires_at` column and check in `accept_invitations` |
| 6 | **NEW: dependency advisories.** `zod@3` (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized constrained arrays) and `postcss` via `next@15` (source-map file read / `</style>` XSS). The zod risk is reduced because every JSON API caps body size (2–10 kB, workspace 5 MB) before validation. postcss only processes our own build-time CSS. Both fixes are major upgrades. | High (advisory) / Low–Medium (exposure) | Sprint 3: zod 4 migration; plan Next 16. CI blocks on critical and reports high |
| 7 | Rate limiting is in-memory per instance | Medium | Sprint 3: shared limiter |
| 8 | No MFA; the JWT `aal` claim is never checked | High for real data | Sprint 3: TOTP + AAL2 checks in API routes and RLS |
| 9 | CSP needs `'unsafe-inline'` for scripts | Low–Medium | Sprint 3: nonce-based CSP via middleware |
| 10 | Workflows run inside the request; a crash mid-run leaves a partially advanced run (resumable, but nothing re-drives it) | Medium (reliability) | Sprint 4: durable runner |
| 11 | Workspace document records are not schema-validated server-side beyond shape/size | Medium | Sprint 3: Zod validation of `WorkspaceDoc` on PUT |

Verified as sound: tenant isolation and role policies (`tests/rls.test.ts` runs the real migration on Postgres, and weakening a policy makes it fail); approval-gate triggers; append-only `audit_events`; no service-role key; identity taken from the session; same-site-only post-login redirects (now covered by E2E).

## Tests at baseline

10 Vitest files with 118 tests: statistics, engine rules, generator and drift, résumés, agents (21), API security, nationality fixture, cloud service and merge, and RLS on Postgres (8). There were no browser tests.

## Proposed changes (3.1)

1. **Sprint 1 (this branch):** ESLint, Playwright, browser smoke/journey/security suites, GitHub Actions CI.
2. **Sprint 2:** authenticated E2E against a disposable Supabase project; invitation expiry; idempotent onboarding.
3. **Sprint 3:** findings 1–4, 6–9 and 11.
4. **Sprint 4:** durable workflows (provider ADR first).
5. **Sprint 5:** optional LLM reasoning behind the existing disabled provider interface.

## Migration risks

- Moving reports, audits and findings out of the workspace JSON into tables needs a backfill that keeps the existing IDs; until the backfill completes, both read paths have to coexist.
- Adding `expires_at` to invitations must default existing rows to a future date, so existing invitations don't suddenly stop working.
- zod 4 changes error shapes, and the API error messages depend on them. This is covered by the existing tests.

## Rollback strategy

- Code: every sprint is a PR into `main`. Rollback means reverting the merge commit; Vercel then redeploys the previous build (or use Vercel "Promote" on the last good deployment).
- Database: migrations are additive (new tables and columns with defaults). Each one ships with a matching down script in `supabase/migrations/`, and a migration must not drop or rewrite existing rows until a later, separately approved release.
- Nothing in Sprint 1 changes the runtime or the schema. The only runtime-visible change is an optional `NEXT_DIST_DIR` build setting, which defaults to `.next`.
