# Architecture — DeepTrace 2.0

```
src/app/(marketing)   public site — server components, statically generated, indexed
src/app/(app)         workspace — client pages, StoreProvider + Shell, noindex, disallowed in robots.txt
src/app/api/v1        health · sample-dataset · audits (POST) · contact (POST)
src/lib/fairness      audit engine, stats, drift, counterfactual (pure, deterministic, tested)
src/lib/data          sample export, generator, résumé pack
src/lib/adapters      provider-neutral source adapters + screening-engine adapters (read-only)
src/lib/site          research register, security-control register, nav, demo data
src/lib/security      rate limiter, safe evidence links
```

Workspace state is per browser (localStorage, versioned with `migrateState`). Audit requests send only in-scope records and the single analysed category; the API re-validates category authorisation, strips other sensitive fields, enforces size and rate limits, and returns results plus a dataset hash.

## Gaps vs. a production deployment

| Requirement | Today | Next step |
|---|---|---|
| Authentication, MFA | Demo role switcher | OIDC provider; server-side RBAC on every route |
| Tenant isolation | Per-browser workspace | Postgres with tenant-scoped tables, RLS, cross-tenant tests |
| Encrypted sensitive store | Masked in UI, minimised in API | Separate schema / column encryption with managed keys |
| Reports | Print-to-PDF + JSON with checksum | Server-side PDF, signed expiring links |
| Audit log | Append-only in workspace | Server-side insert-only table with hash chaining |
| Rate limiting | In-memory per instance | Shared store (Redis/Upstash) |
| CSP | `'unsafe-inline'` scripts | Nonce-based CSP via middleware |
| Testing | Vitest unit + API tests | Playwright E2E, axe accessibility checks, visual regression |
| Integrations | CSV, JSON, mock Workday-style | Authorised, documented customer integrations only |
