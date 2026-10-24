/**
 * Honest register of security controls for the public Security page.
 * "tested" means an automated test in tests/ exercises the control.
 */
export type ControlStatus = "tested" | "unverified" | "planned";

export interface SecurityControl {
  area: string;
  control: string;
  status: ControlStatus;
  detail: string;
}

export const CONTROL_STATUS_LABEL: Record<ControlStatus, string> = {
  tested: "Implemented and tested",
  unverified: "Implemented, not independently verified",
  planned: "Planned",
};

export const SECURITY_CONTROLS: SecurityControl[] = [
  { area: "Identity", control: "Account sign-in (email + password or magic link)", status: "unverified", detail: "Built on Supabase Auth and switched on when a deployment is connected to its database. Not yet exercised against a live project; until then this public deployment is a browser-only demo with a role switcher." },
  { area: "Identity", control: "SSO (OIDC/SAML) and enforced MFA for privileged users", status: "planned", detail: "Not implemented." },
  { area: "Access", control: "Role-based permissions", status: "tested", detail: "With accounts, roles come from organisation membership and are enforced on the server (per-section workspace writes, workflow actions) and by database policies. Automated tests cover both. In the browser-only demo they are enforced in the interface only." },
  { area: "Access", control: "Server-side authorisation of audit categories", status: "tested", detail: "The audit API rejects categories the organisation has not authorised (HTTP 403)." },
  { area: "Tenancy", control: "Organisation-level tenant isolation and database row-level security", status: "tested", detail: "Every table has row-level security and the app never uses a service-role key. Cross-tenant, anonymous-access and role tests run against the real migration on Postgres. Active once a deployment is connected to its database." },
  { area: "Data", control: "Data minimisation in audit requests", status: "tested", detail: "Only in-scope records and the single analysed category reach the API; other sensitive fields are stripped server-side." },
  { area: "Data", control: "Restricted demographic information in recruiter views", status: "unverified", detail: "Raw self-reported values are masked for non-Admin roles in tables and previews." },
  { area: "Data", control: "Small-group suppression", status: "tested", detail: "Groups below the minimum size have counts withheld and are excluded from comparisons." },
  { area: "Input", control: "Import validation (type, duplicates, dates, scores)", status: "tested", detail: "Rows with errors are excluded and reported; unmapped columns are dropped." },
  { area: "Input", control: "Request size and type limits", status: "tested", detail: "API bodies are size-capped and schema-checked; uploads limited to 10 MB / 20,000 rows." },
  { area: "Input", control: "Safe evidence links", status: "tested", detail: "Only https links or plain document references are accepted; other URL schemes are rejected." },
  { area: "Abuse", control: "Rate limiting on public APIs", status: "tested", detail: "Fixed-window limits on audit and contact endpoints. In-memory, so best-effort per serverless instance." },
  { area: "Abuse", control: "Spam prevention on contact form", status: "tested", detail: "Honeypot field, minimum fill time and server-side validation." },
  { area: "Platform", control: "Security headers and Content-Security-Policy", status: "unverified", detail: "CSP, HSTS, frame denial, nosniff and a restrictive permissions policy. Scripts still need 'unsafe-inline' until nonces are added." },
  { area: "Platform", control: "Secrets management", status: "unverified", detail: "No secrets in the repository; configuration (e.g. contact delivery) comes from Vercel environment variables." },
  { area: "Audit", control: "Append-only audit event log", status: "tested", detail: "With accounts, events are stored server-side, attributed to the signed-in user by the server, and the database refuses updates and deletes. Hash chaining is planned. In the browser-only demo the log lives in the browser." },
  { area: "Reports", control: "Report integrity checksum", status: "unverified", detail: "Each report carries a SHA-256 checksum that can be re-verified." },
  { area: "Reports", control: "Authorised, expiring report downloads", status: "planned", detail: "Reports currently stay in the creator's browser; signed expiring links come with server storage." },
  { area: "Lifecycle", control: "Data retention and verified purge", status: "planned", detail: "Admins can delete datasets and reset the demo workspace. Configurable retention and verified purge need server storage." },
  { area: "Demo", control: "No real applicant data in the public demo", status: "tested", detail: "All demo data is generated synthetically and deterministically." },
];
