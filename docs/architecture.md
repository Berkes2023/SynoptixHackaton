# Architecture

## Sprint 1 (deployed on Vercel)

```
Browser (Next.js client pages)
  ├─ Data Hub: CSV parse → field mapping → validation → commit (browser workspace)
  ├─ Audit Lab ── POST /api/v1/audits ──► Vercel function → fairness engine (pure TS)
  ├─ Investigations / Reports (JSON + print-to-PDF, SHA-256 checksum)
  └─ Counterfactual Lab → mock screening engine (in browser)
API: GET /api/v1/health · GET /api/v1/sample-dataset · POST /api/v1/audits
```

Why: Vercel hosts the demo with zero infrastructure and no real personal data at rest. Workspace state lives in each visitor's browser, so visitors never see each other's data.

## Gaps vs. the PRD target, in order

| PRD requirement | Sprint 1 | Next step |
|---|---|---|
| PostgreSQL, tenant-scoped tables, RLS | Browser workspace per visitor | Postgres (e.g. Neon/Supabase) with the PRD schema + RLS + cross-tenant tests |
| OIDC auth, MFA, RBAC | Demo role switcher; permissions checked in UI; API checks category authorisation | OIDC provider; enforce roles server-side |
| Celery + Redis async jobs | Synchronous API (audits take milliseconds) | Queue for large datasets |
| Encrypted sensitive-attribute store | Masked in UI for non-Admins; minimised in API payloads | Separate schema / column encryption with KMS |
| WeasyPrint PDFs, object storage, expiring links | Print-to-PDF + JSON with checksum | Server-side PDF, signed URLs |
| Append-only audit events | In-workspace event log | DB table with insert-only grants and hash chaining |
| Python fairness engine (pandas/SciPy/Fairlearn) | TypeScript engine validated against reference values | Port or cross-validate against SciPy in CI |

The engine's inputs/outputs (`src/lib/fairness/types.ts`) are the contract to keep when moving to the Python service.
