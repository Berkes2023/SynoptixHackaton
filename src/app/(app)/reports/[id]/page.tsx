"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, Kv, attrLabel, fmtDate, fmtP, pct, stageLabel } from "@/components/ui";
import type { buildReport } from "@/lib/reports";
import { SelectionRateChart } from "@/components/charts";
import type { AuditResult } from "@/lib/fairness/types";
import { sha256Hex } from "@/lib/hash";
import { useStore } from "@/lib/store";

type Payload = Awaited<ReturnType<typeof buildReport>>["payload"];

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-8 border-b border-line pb-1 text-base font-semibold">{children}</h2>;
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { state, log } = useStore();
  const [verified, setVerified] = useState<null | boolean>(null);
  const report = state.reports.find((r) => r.id === id);
  if (!report) return <EmptyState title="Report not found" body="It may have been removed by a demo reset." href="/reports" cta="All reports" />;
  const p = report.payload as unknown as Payload;
  const cfg = p.audit.configuration;
  const conf = `${Math.round(cfg.confidenceLevel * 100)}%`;

  function downloadJson() {
    const blob = new Blob([JSON.stringify({ ...p, checksum_sha256: report!.checksum }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deeptrace-audit-report-${report!.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log("report.downloaded", `report:${report!.id}`, "json");
  }

  async function verify() {
    setVerified((await sha256Hex(JSON.stringify(p))) === report!.checksum);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/reports" className="text-sm text-brand underline">
          ← Reports
        </Link>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={verify}>
            Verify checksum
          </button>
          <button className="btn btn-secondary" onClick={downloadJson}>
            Download JSON
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              log("report.downloaded", `report:${report.id}`, "pdf/print");
              window.print();
            }}
          >
            Save as PDF
          </button>
        </div>
      </div>
      {verified != null && (
        <div className={`no-print mb-4 rounded-md border px-3 py-2 text-sm ${verified ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          {verified ? "✓ Checksum matches — report content is unchanged since generation." : "▲ Checksum mismatch — report content has been altered."}
        </div>
      )}

      <article className="print-page rounded-xl border border-line bg-white p-6 shadow-sm sm:p-10">
        <section className="flex min-h-[60vh] flex-col justify-between border-b border-line pb-10 print:min-h-[90vh] print:border-0" aria-label="Cover page">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="8" fill="#1c5cab" />
              <path d="M9 22 L14 14 L18 18 L23 9" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            DeepTrace
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-2">Recruitment Fairness Audit Report</div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              {p.audit.job.title}
              <br />
              <span className="text-ink-2">{stageLabel(cfg.stage)} · by {attrLabel(cfg.groupingAttribute).toLowerCase()}</span>
            </h1>
            <p className="mt-4 text-sm">{p.organisation.name}</p>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
            <Kv k="Generated" v={fmtDate(p.generated_at)} />
            <Kv k="Prepared by" v={p.generated_by} />
            <Kv k="Report ID" v={report.id} />
            <Kv k="Classification" v={p.data_type === "synthetic" ? "Synthetic demonstration" : "Internal — confidential"} />
          </dl>
        </section>
        <div className="print-break" />
        <header className="flex flex-col gap-2 border-b-2 border-brand pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-brand">DeepTrace · Recruitment Fairness Audit</div>
            <h1 className="mt-1 text-2xl font-semibold">
              {p.audit.job.title} — {stageLabel(cfg.stage)}
            </h1>
            <div className="text-sm text-ink-2">
              {p.organisation.name} · grouped by {attrLabel(cfg.groupingAttribute)}
            </div>
          </div>
          <div className="text-xs text-ink-2 sm:text-right">
            Report {report.id}
            <br />
            Generated {fmtDate(p.generated_at)} by {p.generated_by}
          </div>
        </header>

        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{p.data_type === "synthetic" ? "SYNTHETIC DATA — " : ""}</strong>
          {p.disclaimer}
        </div>

        <H2>1. Executive summary</H2>
        <p className="text-sm">{p.results.conclusion}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>
            Scope: {p.audit.job.title} ({p.audit.job.ref}), stage &ldquo;{stageLabel(cfg.stage)}&rdquo;, compared by self-reported {attrLabel(cfg.groupingAttribute).toLowerCase()}.
          </li>
          <li>
            {p.findings.filter((f) => f.severity === "high" || f.severity === "medium").length} finding(s) of medium or high severity;{" "}
            {p.findings.filter((f) => f.investigation && (f.investigation.status === "resolved" || f.investigation.status === "inconclusive")).length} with a recorded human
            decision.
          </li>
          {p.results.selection_comparisons.map((c) => (
            <li key={c.group}>
              {c.group} vs {c.reference}: impact ratio {c.ratio?.toFixed(3) ?? "—"} (Holm-adjusted p {fmtP(c.adjustedP)}).
            </li>
          ))}
          <li>This report does not determine whether unlawful discrimination occurred.</li>
        </ul>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kv k="Records in scope" v={p.sample.scopedRecords} />
          <Kv k="Analysed" v={p.sample.analysed} />
          <Kv k="Missing attribute" v={`${p.sample.missingAttribute} (${pct(p.sample.missingAttributeRate)})`} />
          <Kv k="Findings" v={p.findings.length} />
        </dl>

        <H2>2. Source provenance</H2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Kv k="Dataset SHA-256 (analysed records)" v={<span className="font-mono text-xs">{p.audit.dataset_hash_sha256}</span>} />
          <Kv k="Audit run" v={`${p.audit.id} · ${fmtDate(p.audit.run_at)} · ${p.audit.run_by}`} />
        </dl>
        <table className="table mt-3 text-xs">
          <thead>
            <tr>
              <th>Import</th>
              <th>File</th>
              <th>File SHA-256</th>
              <th>Rows (file / imported / excluded)</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {p.provenance.map((i) => (
              <tr key={i.import_id}>
                <td className="font-mono">{i.import_id}</td>
                <td>{i.file_name}</td>
                <td className="break-all font-mono">{i.file_sha256.slice(0, 24)}…</td>
                <td className="tabular">
                  {i.rows_in_file} / {i.rows_imported} / {i.rows_excluded}
                </td>
                <td>{i.source_systems.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <H2>3. Analysis settings &amp; methodology</H2>
        <p className="text-xs text-ink-2">
          Methodology {p.audit.methodology_version} · engine {p.audit.engine_version} · {conf} confidence · minimum group size {cfg.minimumGroupSize} · impact heuristic{" "}
          {cfg.impactThreshold} · α {cfg.alpha} (Holm) · metrics {cfg.metrics.join(", ")}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{p.methodology.map((m) => <li key={m}>{m}</li>)}</ul>

        <H2>4. Results</H2>
        {p.results.groups.some((g) => !g.suppressed) && (
          <div className="mb-4 break-inside-avoid">
            <SelectionRateChart
              result={{ groups: p.results.groups, referenceGroup: p.results.reference_group, config: cfg } as unknown as AuditResult}
              height={240}
            />
          </div>
        )}
        <table className="table tabular text-sm">
          <thead>
            <tr>
              <th>Group</th>
              <th>Selected / n</th>
              <th>Rate ({conf} CI)</th>
              <th>Ratio ({conf} CI)</th>
              <th>Holm p</th>
            </tr>
          </thead>
          <tbody>
            {p.results.groups.map((g) => {
              const c = p.results.selection_comparisons.find((x) => x.group === g.group);
              return (
                <tr key={g.group}>
                  <td>
                    {g.group}
                    {g.group === p.results.reference_group ? " (reference)" : ""}
                  </td>
                  {g.suppressed ? (
                    <td colSpan={4} className="text-ink-2">
                      Suppressed (n &lt; {cfg.minimumGroupSize})
                    </td>
                  ) : (
                    <>
                      <td>
                        {g.selected} / {g.n}
                      </td>
                      <td>
                        {pct(g.selectionRate)} ({pct(g.ci!.lower)}–{pct(g.ci!.upper)})
                      </td>
                      <td>{c ? `${c.ratio?.toFixed(3) ?? "—"}${c.ratioCi ? ` (${c.ratioCi.lower.toFixed(3)}–${c.ratioCi.upper.toFixed(3)})` : ""}` : "—"}</td>
                      <td>{c ? fmtP(c.adjustedP) : "—"}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {p.results.score_comparisons.length > 0 && (
          <table className="table tabular mt-4 text-sm">
            <thead>
              <tr>
                <th>Score comparison</th>
                <th>Δ mean</th>
                <th>Cohen&apos;s d</th>
                <th>Holm p (Mann–Whitney)</th>
              </tr>
            </thead>
            <tbody>
              {p.results.score_comparisons.map((s) => (
                <tr key={s.group}>
                  <td>
                    {s.group} vs {s.reference}
                  </td>
                  <td>{s.meanDifference.toFixed(2)}</td>
                  <td>{s.cohensD?.toFixed(2) ?? "—"}</td>
                  <td>{fmtP(s.adjustedP)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <H2>5. Findings &amp; human review</H2>
        {p.findings.length === 0 && <p className="text-sm text-ink-2">No findings met the flagging rules.</p>}
        <div className="space-y-4">
          {p.findings.map((f, i) => (
            <section key={f.id} className="break-inside-avoid rounded-md border border-line p-4">
              <div className="text-xs uppercase tracking-wide text-ink-2">
                Finding {i + 1} · {f.severity} · {f.category.replace("_", " ")} · status {f.status}
              </div>
              <h3 className="mt-1 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm">{f.summary}</p>
              <div className="mt-2 text-xs font-semibold uppercase text-ink-2">Evidence</div>
              <ul className="list-disc pl-5 text-sm">{f.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
              <div className="mt-2 text-xs font-semibold uppercase text-ink-2">Limitations</div>
              <ul className="list-disc pl-5 text-sm text-ink-2">{f.limitations.map((e) => <li key={e}>{e}</li>)}</ul>
              <div className="mt-2 text-xs font-semibold uppercase text-ink-2">Investigation</div>
              {f.investigation ? (
                <div className="text-sm">
                  Owner {f.investigation.owner} · {f.investigation.status.replace("_", " ")}
                  {f.investigation.resolution && <> · resolution: {f.investigation.resolution.replace(/_/g, " ")}</>}
                  {f.investigation.reviewer_notes.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-ink-2">
                      {f.investigation.reviewer_notes.map((n, k) => (
                        <li key={k}>
                          “{n.text}” — {n.author}, {fmtDate(n.at)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-2">No investigation opened at the time of report generation.</p>
              )}
            </section>
          ))}
        </div>

        <H2>6. Follow-up recommendations</H2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {(p.recommendations ?? ["Re-run this audit periodically and monitor drift between periods."]).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <H2>7. Limitations</H2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{p.limitations.map((l) => <li key={l}>{l}</li>)}</ul>

        <H2>8. Version information</H2>
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Kv k="Report format" v={p.versions?.report_format ?? p.report_format} />
          <Kv k="Methodology" v={p.versions?.methodology ?? p.audit.methodology_version} />
          <Kv k="Engine" v={p.versions?.engine ?? p.audit.engine_version} />
          <Kv k="Application" v={p.versions?.application ?? "deeptrace-1.x"} />
        </dl>

        <footer className="mt-10 border-t border-line pt-3 text-[11px] text-muted">
          Report SHA-256: <span className="break-all font-mono">{report.checksum}</span>
          <br />
          DeepTrace is read-only with respect to external ATS systems and does not make hiring decisions. This report does not constitute legal advice.
        </footer>
      </article>
    </div>
  );
}
