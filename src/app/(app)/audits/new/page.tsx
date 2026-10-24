"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { EmptyState, PageHeader, Restricted, attrLabel, stageLabel } from "@/components/ui";
import { minimiseForAudit, SUPPORTED_AUDIT_ATTRIBUTES } from "@/lib/fairness/audit";
import type { AuditConfig, AuditResult, MetricName } from "@/lib/fairness/types";
import { newId, useStore, type AuditRun, type Finding } from "@/lib/store";

const METRIC_LABELS: Record<MetricName, string> = {
  selection_rate: "Selection-rate comparison (with Wilson CIs)",
  selection_rate_ratio: "Adverse impact ratio (screening heuristic)",
  score_distribution: "ATS score distribution analysis",
};

function NewAuditForm() {
  const { state, update, log, can, user } = useStore();
  const router = useRouter();
  const params = useSearchParams();

  const jobs = useMemo(() => {
    const m = new Map<string, { title: string; stages: Set<string> }>();
    for (const r of state.records) {
      const j = m.get(r.jobRef) ?? { title: r.jobTitle, stages: new Set() };
      j.stages.add(r.stage);
      m.set(r.jobRef, j);
    }
    return m;
  }, [state.records]);

  const firstJob = params.get("job") && jobs.has(params.get("job")!) ? params.get("job")! : [...jobs.keys()].sort()[0];
  const [jobRef, setJobRef] = useState(firstJob ?? "");
  const stages = [...(jobs.get(jobRef)?.stages ?? [])];
  const [stage, setStage] = useState(stages.includes("initial_screening") ? "initial_screening" : (stages[0] ?? ""));
  const attrsFor = (ref: string) =>
    SUPPORTED_AUDIT_ATTRIBUTES.filter((a) => state.records.some((r) => r.jobRef === ref && r.sensitive[a] != null));
  const [attribute, setAttribute] = useState<string>(() => attrsFor(firstJob ?? "")[0] ?? "gender");
  const [metrics, setMetrics] = useState<MetricName[]>(["selection_rate", "selection_rate_ratio", "score_distribution"]);
  const [confidence, setConfidence] = useState(state.settings.confidenceLevel);
  const [minGroup, setMinGroup] = useState(state.settings.minimumGroupSize);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  if (jobs.size === 0) return <EmptyState title="No data to audit" body="Import screening records first." href="/imports" cta="Go to Data Hub" />;
  if (!can("runAudit")) return <Restricted what="run audits (Admin or Auditor required)" />;

  async function run() {
    setError(null);
    setRunning(true);
    const config: AuditConfig = {
      jobRef,
      stage,
      analysisType: "observational",
      groupingAttribute: attribute,
      metrics,
      confidenceLevel: confidence,
      minimumGroupSize: minGroup,
      impactThreshold: state.settings.impactThreshold,
      alpha: state.settings.alpha,
    };
    const records = minimiseForAudit(state.records, config);
    try {
      const res = await fetch("/api/v1/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, authorisedAttributes: state.settings.authorisedAttributes, records }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Audit failed (${res.status})`);
      const result = body.result as AuditResult;
      const auditId = newId("aud");
      const now = new Date().toISOString();
      const audit: AuditRun = {
        id: auditId,
        createdAt: now,
        createdBy: user.name,
        jobTitle: jobs.get(jobRef)!.title,
        datasetHash: body.dataset_hash,
        importIds: [...new Set(state.records.filter((r) => r.jobRef === jobRef && r.stage === stage).map((r) => r.importId ?? "unknown"))],
        result,
      };
      const findings: Finding[] = result.findings.map((f) => ({ ...f, id: newId("fnd"), auditId, status: "open", createdAt: now }));
      update((s) => ({ ...s, audits: [...s.audits, audit], findings: [...s.findings, ...findings] }));
      log("audit.completed", `audit:${auditId}`, `${jobRef}/${stage}/${attribute}; dataset ${body.dataset_hash.slice(0, 16)}; ${findings.length} findings`);
      router.push(`/audits/${auditId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
      setRunning(false);
    }
  }

  const toggleMetric = (m: MetricName) => setMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="job">Job requisition</label>
            <select
              id="job"
              className="input"
              value={jobRef}
              onChange={(e) => {
                setJobRef(e.target.value);
                const st = [...(jobs.get(e.target.value)?.stages ?? [])];
                setStage(st.includes("initial_screening") ? "initial_screening" : (st[0] ?? ""));
                setAttribute(attrsFor(e.target.value)[0] ?? "gender");
              }}
            >
              {[...jobs.entries()].sort().map(([ref, j]) => (
                <option key={ref} value={ref}>
                  {ref} — {j.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="stage">Screening stage</label>
            <select id="stage" className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="attr">Audit category (self-reported)</label>
            <select id="attr" className="input" value={attribute} onChange={(e) => setAttribute(e.target.value)}>
              {SUPPORTED_AUDIT_ATTRIBUTES.map((a) => (
                <option key={a} value={a} disabled={!state.settings.authorisedAttributes.includes(a) || !attrsFor(jobRef).includes(a)}>
                  {attrLabel(a)}
                  {!state.settings.authorisedAttributes.includes(a) ? " — not authorised" : !attrsFor(jobRef).includes(a) ? " — not in this dataset" : ""}
                </option>
              ))}
              <option disabled>Ethnicity — not collected in this dataset</option>
            </select>
          </div>
          <div>
            <label className="label">Analysis type</label>
            <div className="input bg-plane text-ink-2">Observational audit</div>
          </div>
          <div>
            <label className="label" htmlFor="conf">Confidence level</label>
            <select id="conf" className="input" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))}>
              {[0.9, 0.95, 0.99].map((c) => (
                <option key={c} value={c}>
                  {Math.round(c * 100)}%
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="min">Minimum reportable group size</label>
            <input id="min" type="number" min={5} max={1000} className="input" value={minGroup} onChange={(e) => setMinGroup(Number(e.target.value))} />
          </div>
        </div>
        <fieldset className="mt-5">
          <legend className="label">Metrics</legend>
          <div className="space-y-2">
            {(Object.keys(METRIC_LABELS) as MetricName[]).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={metrics.includes(m)} onChange={() => toggleMetric(m)} />
                {METRIC_LABELS[m]}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <button className="btn btn-primary mt-5" onClick={run} disabled={running || metrics.length === 0 || !stage}>
          {running ? "Running audit…" : "Run audit"}
        </button>
      </section>
      <aside className="card text-sm text-ink-2">
        <h2 className="mb-2 text-sm font-semibold text-ink">What this audit can conclude</h2>
        <p>An observational audit measures whether disparities exist in recorded outcomes. It cannot establish their cause.</p>
        <p className="mt-3">
          Only the selected job, stage and audit category are sent for analysis (data minimisation). Missing demographic values are excluded, never imputed.
        </p>
        <p className="mt-3">
          Flagging rule: adverse impact ratio below {state.settings.impactThreshold} and/or Holm-adjusted p &lt; {state.settings.alpha}. Policies are set by an Admin in Settings.
        </p>
      </aside>
    </div>
  );
}

export default function NewAuditPage() {
  return (
    <>
      <PageHeader title="Configure a fairness audit" subtitle="Deterministic, versioned analysis — the same data and settings always give the same metrics." />
      <Suspense>
        <NewAuditForm />
      </Suspense>
    </>
  );
}
