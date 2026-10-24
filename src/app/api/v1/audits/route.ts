import { NextResponse } from "next/server";
import { ENGINE_VERSION, METHODOLOGY_VERSION, runAudit, SUPPORTED_AUDIT_ATTRIBUTES } from "@/lib/fairness/audit";
import type { AuditConfig, MetricName, ScreeningRecord } from "@/lib/fairness/types";
import { canonicalDataset, sha256Hex } from "@/lib/hash";
import { clientKey, createRateLimiter } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const METRICS: MetricName[] = ["selection_rate", "selection_rate_ratio", "score_distribution"];
const MAX_RECORDS = 50_000;
const MAX_BYTES = 4_000_000; // Vercel functions accept ~4.5 MB bodies
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/v1/audits — stateless, deterministic observational audit.
 * Body: { config: AuditConfig, authorisedAttributes: string[], records: ScreeningRecord[] }
 * The client sends only the grouping attribute (data minimisation); any other
 * sensitive fields are stripped here before analysis.
 */
export async function POST(req: Request) {
  const rl = limiter.check(clientKey(req));
  if (!rl.allowed) return NextResponse.json({ error: "Too many audit requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return bad("Request too large.", 413);

  let body: { config?: Partial<AuditConfig>; authorisedAttributes?: unknown; records?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return bad("Request too large.", 413);
    body = JSON.parse(text);
  } catch {
    return bad("Body must be JSON.");
  }
  const c = body.config ?? {};
  if (typeof c.jobRef !== "string" || typeof c.stage !== "string") return bad("config.jobRef and config.stage are required.");
  if (c.analysisType !== "observational") return bad("Only analysis_type 'observational' is supported by this endpoint.");
  if (typeof c.groupingAttribute !== "string" || !(SUPPORTED_AUDIT_ATTRIBUTES as readonly string[]).includes(c.groupingAttribute))
    return bad(`grouping_attribute must be one of: ${SUPPORTED_AUDIT_ATTRIBUTES.join(", ")}.`);
  const authorised = Array.isArray(body.authorisedAttributes) ? body.authorisedAttributes : [];
  if (!authorised.includes(c.groupingAttribute))
    return bad(`The organisation has not authorised analysis of "${c.groupingAttribute}". An admin must record a lawful basis first.`, 403);
  if (!Array.isArray(c.metrics) || c.metrics.length === 0 || !c.metrics.every((m) => METRICS.includes(m))) return bad("metrics must be a non-empty subset of " + METRICS.join(", "));
  if (typeof c.confidenceLevel !== "number" || ![0.9, 0.95, 0.99].includes(c.confidenceLevel)) return bad("confidence_level must be 0.90, 0.95 or 0.99.");
  if (typeof c.minimumGroupSize !== "number" || c.minimumGroupSize < 5 || c.minimumGroupSize > 1000) return bad("minimum_group_size must be between 5 and 1000.");
  const impactThreshold = typeof c.impactThreshold === "number" && c.impactThreshold > 0 && c.impactThreshold < 1 ? c.impactThreshold : 0.8;
  const alpha = typeof c.alpha === "number" && c.alpha > 0 && c.alpha < 0.5 ? c.alpha : 0.05;

  if (!Array.isArray(body.records) || body.records.length === 0) return bad("records must be a non-empty array.");
  if (body.records.length > MAX_RECORDS) return bad(`At most ${MAX_RECORDS} records per request.`, 413);

  const attr = c.groupingAttribute;
  const records: ScreeningRecord[] = [];
  for (const raw of body.records as Partial<ScreeningRecord>[]) {
    if (typeof raw?.applicationId !== "string" || typeof raw.jobRef !== "string" || typeof raw.stage !== "string" || typeof raw.decisionAt !== "string")
      return bad("Each record needs applicationId, jobRef, stage and decisionAt.");
    const value = raw.sensitive?.[attr];
    records.push({
      applicationId: raw.applicationId,
      candidateRef: String(raw.candidateRef ?? ""),
      jobRef: raw.jobRef,
      jobTitle: String(raw.jobTitle ?? ""),
      department: raw.department ?? null,
      appliedAt: raw.appliedAt ?? null,
      stage: raw.stage,
      score: typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : null,
      grade: raw.grade ?? null,
      decision: raw.decision ?? null,
      decisionAt: raw.decisionAt,
      sourceSystem: String(raw.sourceSystem ?? "unknown"),
      sensitive: { [attr]: typeof value === "string" ? value : null },
    });
  }

  const config: AuditConfig = {
    jobRef: c.jobRef,
    stage: c.stage,
    analysisType: "observational",
    groupingAttribute: attr,
    metrics: METRICS.filter((m) => c.metrics!.includes(m)),
    confidenceLevel: c.confidenceLevel,
    minimumGroupSize: Math.round(c.minimumGroupSize),
    impactThreshold,
    alpha,
  };
  const scoped = records.filter((r) => r.jobRef === config.jobRef && r.stage === config.stage);
  if (scoped.length === 0) return bad("No records match the requested job and stage.", 422);

  const result = runAudit(scoped, config);
  const datasetHash = await sha256Hex(canonicalDataset(scoped));
  return NextResponse.json({
    status: "completed",
    data_type: "synthetic",
    methodology_version: METHODOLOGY_VERSION,
    engine_version: ENGINE_VERSION,
    dataset_hash: datasetHash,
    result,
  });
}
