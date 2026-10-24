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
  { area: "Identity", control: "Authentication (OIDC) with MFA for privileged users", status: "planned", detail: "The demo has no login. A role switcher simulates Admin, Auditor, Reviewer and Read-only users." },
  { area: "Access", control: "Role-based permissions", status: "unverified", detail: "Enforced in the demo interface (e.g. only Admins see raw demographic values). Server-side enforcement arrives with authentication." },
  { area: "Access", control: "Server-side authorisation of audit categories", status: "tested", detail: "The audit API rejects categories the organisation has not authorised (HTTP 403)." },
  { area: "Tenancy", control: "Organisation-level tenant isolation and database row-level security", status: "planned", detail: "There is no shared database today: each browser holds its own isolated demo workspace. Production requires tenant-scoped tables, RLS and cross-tenant tests." },
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
  { area: "Audit", control: "Append-only audit event log", status: "unverified", detail: "Every action is attributed and timestamped in the workspace. Tamper-evidence (hash chaining, server storage) is planned." },
  { area: "Reports", control: "Report integrity checksum", status: "unverified", detail: "Each report carries a SHA-256 checksum that can be re-verified." },
  { area: "Reports", control: "Authorised, expiring report downloads", status: "planned", detail: "Reports currently stay in the creator's browser; signed expiring links come with server storage." },
  { area: "Lifecycle", control: "Data retention and verified purge", status: "planned", detail: "Admins can delete datasets and reset the demo workspace. Configurable retention and verified purge need server storage." },
  { area: "Demo", control: "No real applicant data in the public demo", status: "tested", detail: "All demo data is generated synthetically and deterministically." },
];
