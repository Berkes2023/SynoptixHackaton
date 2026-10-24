import { describe, expect, it } from "vitest";
import { POST as auditPost } from "@/app/api/v1/audits/route";
import { POST as contactPost } from "@/app/api/v1/contact/route";
import { validateContact } from "@/lib/contact";
import { demoRecords, demoConfig } from "@/lib/site/demo-data";
import { minimiseForAudit, runAudit } from "@/lib/fairness/audit";
import { createRateLimiter } from "@/lib/security/rate-limit";
import { safeReference } from "@/lib/security/links";

let ip = 0;
const req = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${++ip}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/v1/audits", () => {
  const config = demoConfig();
  const records = minimiseForAudit(demoRecords(), config);

  it("returns the same metrics as the engine, with a dataset hash", async () => {
    const res = await auditPost(req("/api/v1/audits", { config, authorisedAttributes: ["gender"], records }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dataset_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.result).toEqual(JSON.parse(JSON.stringify(runAudit(records, config))));
  });

  it("rejects an unauthorised category with 403", async () => {
    const res = await auditPost(req("/api/v1/audits", { config, authorisedAttributes: ["age_band"], records }));
    expect(res.status).toBe(403);
  });

  it("rejects unsupported categories and malformed bodies", async () => {
    expect((await auditPost(req("/api/v1/audits", { config: { ...config, groupingAttribute: "ethnicity" }, authorisedAttributes: ["ethnicity"], records }))).status).toBe(400);
    expect((await auditPost(req("/api/v1/audits", "not json"))).status).toBe(400);
    expect((await auditPost(req("/api/v1/audits", { config, authorisedAttributes: ["gender"], records: [] }))).status).toBe(400);
  });

  it("strips sensitive fields other than the analysed category", async () => {
    const withExtra = records.map((r) => ({ ...r, sensitive: { ...r.sensitive, age_band: "Under 40", disability: "yes" } }));
    const a = await (await auditPost(req("/api/v1/audits", { config, authorisedAttributes: ["gender"], records: withExtra }))).json();
    const b = await (await auditPost(req("/api/v1/audits", { config, authorisedAttributes: ["gender"], records }))).json();
    expect(a.dataset_hash).toBe(b.dataset_hash);
  });

  it("rejects oversized bodies with 413", async () => {
    const res = await auditPost(req("/api/v1/audits", "x".repeat(4_100_000)));
    expect(res.status).toBe(413);
  });
});

describe("contact", () => {
  const good = { name: "Sam Patel", organisation: "Northwind Demo Ltd", email: "sam@northwind.example", reason: "demo", message: "Hello", startedAt: Date.now() - 10_000 };

  it("accepts a valid business enquiry", () => {
    expect(validateContact(good).ok).toBe(true);
  });

  it("rejects honeypot, too-fast, free-mail and invalid fields", () => {
    const fail = (b: object) => {
      const v = validateContact({ ...good, ...b });
      return v.ok ? null : v.errors;
    };
    expect(fail({ website: "spam" })?.form).toBeTruthy();
    expect(fail({ startedAt: Date.now() })?.form).toBeTruthy();
    expect(fail({ email: "someone@gmail.com" })?.email).toMatch(/work email/);
    expect(fail({ email: "not-an-email" })?.email).toBeTruthy();
    expect(fail({ reason: "sales" })?.reason).toBeTruthy();
    expect(fail({ message: "x".repeat(2001) })?.message).toBeTruthy();
  });

  it("never reports success when delivery is not configured", async () => {
    delete process.env.CONTACT_WEBHOOK_URL;
    const res = await contactPost(req("/api/v1/contact", good));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBeUndefined();
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then blocks, then resets", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([1, 2, 3].map(() => rl.check("a", 0).allowed)).toEqual([true, true, true]);
    expect(rl.check("a", 10).allowed).toBe(false);
    expect(rl.check("b", 10).allowed).toBe(true);
    expect(rl.check("a", 1001).allowed).toBe(true);
  });
});

describe("evidence links", () => {
  it.each([
    ["https://intranet.example/doc/12", true],
    ["HR-POL-12 v3", true],
    ["javascript:alert(1)", false],
    ["data:text/html,<script>", false],
    ["http://insecure.example", false],
    ["", false],
  ])("%s → %s", (ref, ok) => {
    expect(safeReference(ref).ok).toBe(ok);
  });
});
