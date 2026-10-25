"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ScoreHistogram, SelectionRateChart, groupColor } from "@/components/charts";
import { FindingExplanation } from "@/components/FindingExplanation";
import { Badge, EmptyState, FlagBadge, Kv, PageHeader, SeverityBadge, SyntheticNotice, attrLabel, fmtDate, fmtP, pct, shortHash, stageLabel } from "@/components/ui";
import { minimiseForAudit, runAudit } from "@/lib/fairness/audit";
import { canonicalDataset, sha256Hex } from "@/lib/hash";
import { buildReport } from "@/lib/reports";
import { newId, useStore, type Investigation } from "@/lib/store";

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, update, log, can, user } = useStore();
  const [repro, setRepro] = useState<null | { ok: boolean; message: string }>(null);
  const [busy, setBusy] = useState(false);

  const audit = state.audits.find((a) => a.id === id);
  if (!audit) return <EmptyState title="Audit not found" body="It may have been removed by a demo reset." href="/audits" cta="All audits" />;
  const r = audit.result;
  const c = r.config;
  const conf = `${Math.round(c.confidenceLevel * 100)}%`;
  const allGroups = r.groups.map((g) => g.group);
  const findings = state.findings.filter((f) => f.auditId === audit.id);
  const importFiles = state.imports.filter((i) => audit.importIds.includes(i.id));

  async function reproduce() {
    const scoped = minimiseForAudit(state.records, c);
    const again = runAudit(scoped, c);
    const hash = await sha256Hex(canonicalDataset(scoped));
    const ok = hash === audit!.datasetHash && JSON.stringify(again) === JSON.stringify(r);
    setRepro({
      ok,
      message: ok
        ? `Reproduced: dataset hash and all ${r.groups.length + r.comparisons.length + r.scoreComparisons.length} metric blocks are identical.`
        : hash !== audit!.datasetHash
          ? "The underlying records have changed since this audit (dataset hash differs)."
          : "Metrics differ — please report this.",
    });
    log("audit.reproduced", `audit:${audit!.id}`, ok ? "identical" : "mismatch");
  }

  function openInvestigation(findingId: string) {
    const now = new Date().toISOString();
    const inv: Investigation = {
      id: newId("inv"),
      findingId,
      owner: "Jordan Lee",
      status: "open",
      resolution: "",
      rationale: "",
      evidence: [],
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    update((s) => ({
      ...s,
      investigations: [...s.investigations, inv],
      findings: s.findings.map((f) => (f.id === findingId ? { ...f, status: "investigating" } : f)),
    }));
    log("investigation.opened", `investigation:${inv.id}`, `finding ${findingId}; assigned to Jordan Lee`);
    router.push(`/investigations#${inv.id}`);
  }

  async function generateReport() {
    setBusy(true);
    const { payload, checksum } = await buildReport(state, audit!, user.name);
    const reportId = newId("rpt");
    update((s) => ({ ...s, reports: [...s.reports, { id: reportId, auditId: audit!.id, generatedAt: payload.generated_at, generatedBy: user.name, checksum, payload }] }));
    log("report.generated", `report:${reportId}`, `audit ${audit!.id}; sha256 ${checksum.slice(0, 16)}`);
    router.push(`/reports/${reportId}`);
  }

  return (
    <>
      <PageHeader
        title={`${audit.jobTitle} — ${stageLabel(c.stage)}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Grouped by {attrLabel(c.groupingAttribute)} · observational audit · <FlagBadge flag={r.flag} />
          </span>
        }
        actions={
          <>
            <button className="btn btn-secondary" onClick={reproduce}>
              Re-run &amp; verify
            </button>
            {can("runAudit") && (
              <Link
                href={`/agents?job=${encodeURIComponent(c.jobRef)}&stage=${encodeURIComponent(c.stage)}&attr=${encodeURIComponent(c.groupingAttribute)}`}
                className="btn btn-secondary"
              >
                Run multi-agent audit
              </Link>
            )}
            {can("generateReport") && (
              <button className="btn btn-primary" onClick={generateReport} disabled={busy}>
                {busy ? "Generating…" : "Generate report"}
              </button>
            )}
          </>
        }
      />
      <div className="mb-4">
        <SyntheticNotice compact />
      </div>
      {repro && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${repro.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          {repro.ok ? "✓ " : "▲ "}
          {repro.message}
        </div>
      )}

      <section className="card mb-6">
        <p className="text-sm font-medium">{r.conclusion}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kv k="Run" v={`${fmtDate(audit.createdAt)} · ${audit.createdBy}`} />
          <Kv k="Dataset SHA-256" v={<span className="font-mono text-xs" title={audit.datasetHash}>{shortHash(audit.datasetHash)}</span>} />
          <Kv k="Methodology / engine" v={`${r.methodologyVersion} / ${r.engineVersion}`} />
          <Kv k="Source file" v={importFiles.map((i) => i.fileName).join(", ") || "—"} />
          <Kv k="Records in scope" v={r.sample.scopedRecords} />
          <Kv k="Analysed" v={r.sample.analysed} />
          <Kv k={`Missing ${attrLabel(c.groupingAttribute).toLowerCase()}`} v={`${r.sample.missingAttribute} (${pct(r.sample.missingAttributeRate)})`} />
          <Kv k="Settings" v={`${conf} CI · min group ${c.minimumGroupSize} · α ${c.alpha}`} />
        </dl>
      </section>

      {r.groups.some((g) => !g.suppressed) && (
        <section className="card mb-6">
          <h2 className="text-sm font-semibold">Selection rate by group</h2>
          <p className="text-xs text-ink-2">Bars show the selection rate; whiskers show the {conf} Wilson interval. Dashed line = {c.impactThreshold} × reference group rate.</p>
          <div className="mt-2">
            <SelectionRateChart result={r} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Selected / analysed</th>
                  <th>Rate</th>
                  <th>{conf} CI</th>
                  <th>Ratio vs reference</th>
                  <th>Ratio {conf} CI</th>
                  <th>p (Fisher)</th>
                  <th>Holm-adj. p</th>
                </tr>
              </thead>
              <tbody>
                {r.groups.map((g) => {
                  const cmp = r.comparisons.find((x) => x.group === g.group);
                  return (
                    <tr key={g.group}>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: g.suppressed ? "#c3c2b7" : groupColor(allGroups, g.group) }} />
                          {g.group}
                          {g.group === r.referenceGroup && <Badge color="brand">reference</Badge>}
                        </span>
                      </td>
                      {g.suppressed ? (
                        <td colSpan={7} className="text-xs text-ink-2">
                          Suppressed — fewer than {c.minimumGroupSize} analysed applications
                        </td>
                      ) : (
                        <>
                          <td>
                            {g.selected} / {g.n}
                          </td>
                          <td>{pct(g.selectionRate)}</td>
                          <td>
                            {pct(g.ci!.lower)} – {pct(g.ci!.upper)}
                          </td>
                          <td className={cmp?.belowThreshold ? "font-semibold text-critical" : ""}>{cmp ? (cmp.ratio?.toFixed(3) ?? "undefined") : "1.000"}</td>
                          <td>{cmp?.ratioCi ? `${cmp.ratioCi.lower.toFixed(3)} – ${cmp.ratioCi.upper.toFixed(3)}` : "—"}</td>
                          <td>{cmp ? fmtP(cmp.pValue) : "—"}</td>
                          <td>{cmp ? fmtP(cmp.adjustedP) : "—"}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {c.metrics.includes("score_distribution") && r.groups.some((g) => g.score) && (
        <section className="card mb-6">
          <h2 className="text-sm font-semibold">ATS score distribution</h2>
          <p className="text-xs text-ink-2">Share of each group&apos;s scored applications per score band.</p>
          <div className="mt-2">
            <ScoreHistogram result={r} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Scored</th>
                  <th>Mean</th>
                  <th>Median (IQR)</th>
                  <th>SD</th>
                  <th>Δ mean vs ref</th>
                  <th>Cohen&apos;s d</th>
                  <th>Holm-adj. p (Mann–Whitney)</th>
                </tr>
              </thead>
              <tbody>
                {r.groups
                  .filter((g) => g.score)
                  .map((g) => {
                    const s = r.scoreComparisons.find((x) => x.group === g.group);
                    return (
                      <tr key={g.group}>
                        <td>{g.group}</td>
                        <td>{g.score!.n}</td>
                        <td>{g.score!.mean.toFixed(1)}</td>
                        <td>
                          {g.score!.median.toFixed(1)} ({g.score!.q1.toFixed(1)}–{g.score!.q3.toFixed(1)})
                        </td>
                        <td>{g.score!.sd.toFixed(1)}</td>
                        <td>{s ? s.meanDifference.toFixed(2) : "—"}</td>
                        <td>{s?.cohensD != null ? s.cohensD.toFixed(2) : "—"}</td>
                        <td>{s ? fmtP(s.adjustedP) : "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">Findings ({findings.length})</h2>
        {findings.length === 0 && <p className="card text-sm text-ink-2">No findings met the flagging rules.</p>}
        <div className="space-y-4">
          {findings.map((f) => {
            const inv = state.investigations.find((i) => i.findingId === f.id);
            return (
              <article key={f.id} id={f.id} className="card scroll-mt-20">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={f.severity} />
                      <Badge>{f.category.replace("_", " ")}</Badge>
                      <Badge color={f.status === "resolved" ? "green" : f.status === "investigating" ? "brand" : "neutral"}>{f.status}</Badge>
                    </div>
                    <h3 className="mt-2 font-semibold">{f.title}</h3>
                    <p className="mt-1 text-sm text-ink-2">{f.summary}</p>
                  </div>
                  {inv ? (
                    <Link href={`/investigations#${inv.id}`} className="btn btn-secondary shrink-0">
                      View investigation
                    </Link>
                  ) : (
                    f.severity !== "info" &&
                    can("openInvestigation") && (
                      <button className="btn btn-primary shrink-0" onClick={() => openInvestigation(f.id)}>
                        Open investigation
                      </button>
                    )
                  )}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="label">Evidence</div>
                    <ul className="list-disc space-y-1 pl-4 text-sm">{f.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                  <div>
                    <div className="label">Limitations</div>
                    <ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">{f.limitations.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                  <div>
                    <div className="label">Recommended investigation</div>
                    <ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">{f.recommendedActions.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                </div>
                <FindingExplanation explanation={f.explanation} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2 className="text-sm font-semibold">Audit limitations</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
    </>
  );
}
