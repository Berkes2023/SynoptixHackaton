# Accounts, tenancy and server-side storage

DeepTrace runs in one of two modes:

| | Browser-only demo (default) | Accounts (Supabase configured) |
|---|---|---|
| Sign-in | None; demo role switcher | Email + password or magic link (Supabase Auth) |
| Roles | Switchable fictional users | Per-organisation membership: Admin, Auditor, Reviewer, Read-only |
| Workspace | `localStorage` in one browser | `workspaces` table, one document per organisation |
| Multi-agent workflows | Run in the browser | Run on the server (`/api/v1/workflows`), stored in `workflows` |
| Audit log | In the workspace | `audit_events`, append-only, attributed by the server |
| Tenant isolation | n/a | Row-level security on every table |

With Supabase configured, visitors can still choose **Use the local demo** on the login page.

## Setting it up

1. Create a Supabase project.
2. In the SQL editor, run `supabase/migrations/0001_workspaces.sql`.
3. In **Authentication → URL configuration**, set the Site URL to the production URL (e.g. `https://deeptrace-vert.vercel.app`) and add `https://deeptrace-vert.vercel.app/auth/callback` to the redirect URLs. Keep **Confirm email** on: invitations are only accepted for confirmed addresses.
4. In Vercel → Project → Settings → Environment Variables, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API in Supabase), then redeploy.
5. Sign up, confirm the email, and create the organisation. You become its Admin; invite colleagues from **Settings**.

## Security model

- **No service-role key.** Every database call, including from API routes, runs as the signed-in user with the anon key and their JWT. Row-level security is therefore the tenant boundary everywhere, not only in the browser.
- **RLS policies** (`0001_workspaces.sql`): members read their own organisation's rows only; anonymous users have no grants; Read-only members cannot write; only Admins manage members and never their own membership row; workflows cannot be deleted; the audit log is insert-only with `actor_id = auth.uid()`.
- **Database triggers** back up the human approval gate: a decided approval must be recorded by the signed-in user, never by the workflow's initiator, only by an Admin or Reviewer, and is immutable afterwards. Workflow identity and workspace ownership cannot be changed.
- **Per-section write checks** (`src/lib/workspace/doc.ts`, run on the server): e.g. only Admins change audit policy or delete data, only Reviewers/Admins close investigations.
- **Identity comes from the session.** Workflow initiators, reviewers and audit-log actors are taken from the authenticated user and membership, never from the request body.
- **Concurrency:** the workspace has a version; writes are conditional on it. On conflict the client merges per item (others' changes kept, its own re-applied) and retries.
- **Quotas:** 3 organisations per user; 100 workflows per organisation per day; 5 MB workspace document; rate limits on sign-in and event logging (per instance).

## Verification

- `tests/rls.test.ts` runs the real migration on Postgres (PGlite) with a stand-in for Supabase's `auth` schema and checks tenant isolation, anonymous access, role limits, invitation confirmation, the approval-gate triggers, append-only logging and quotas. Weakening a policy makes these tests fail.
- `tests/cloud.test.ts` covers the server workflow service (self-approval refused, identity not spoofable, cross-tenant access refused, step-through), per-section permissions and the merge.
- Sign-up, email confirmation and sign-in have **not** been exercised against a live Supabase project from this repository; do that after setup.

## Known limits

- The workspace is one JSON document per organisation; very large datasets would need per-record tables.
- Rate limits are in-memory per serverless instance.
- Workflows run inside the API request (milliseconds for the fixed 16-task plan); there is no background job queue.
- Existing browser-demo workspaces are not migrated into an organisation.
