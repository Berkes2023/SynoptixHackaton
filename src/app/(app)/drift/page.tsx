"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, ErrorBar, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, PageHeader, Restricted, attrLabel, pct, stageLabel } from "@/components/ui";
import { datasetFileName, datasetToCsv, generateDataset } from "@/lib/data/generator";
import { SUPPORTED_AUDIT_ATTRIBUTES } from "@/lib/fairness/audit";
import { computeDrift, MATERIAL_SHIFT, type DriftPeriodBy } from "@/lib/fairness/drift";
import { parseCsv } from "@/lib/ingest/csv";
import { autoMap } from "@/lib/ingest/mapping";
import { validateAndMap } from "@/lib/ingest/validate";
import { sha256Hex } from "@/lib/hash";
import { newId, useStore } from "@/lib/store";

export default function DriftPage() {
  const { state, update, log, can, user } = useStore();
  const jobs = useMemo(() => {
    const m = new Map<string, { title: string; stages: Set<string> }>();
    for (const r of state.records) {
      const j = m.get(r.jobRef) ?? { title: r.jobTitle, stages: new Set() };
      j.stages.add(r.stage);
      m.set(r.jobRef, j);
    }
    return m;
  }, [state.records]);
  const [jobRef, setJobRef] = useState<string>("");
  const job = jobRef && jobs.has(jobRef) ? jobRef : ([...jobs.keys()].find((k) => k.startsWith("SYN-")) ?? [...jobs.keys()].sort()[0] ?? "");
  const stages = [...(jobs.get(job)?.stages ?? [])];
  const [stagePick, setStagePick] = useState("initial_screening");
  const stage = stages.includes(stagePick) ? stagePick : (stages[0] ?? "");
  const attrs = SUPPORTED_AUDIT_ATTRIBUTES.filter((a) => state.settings.authorisedAttributes.includes(a) && state.records.some((r) => r.jobRef === job && r.sensitive[a] != null));
  const [attrPick, setAttrPick] = useState("synthetic_group");
  const attr = attrs.includes(attrPick as never) ? attrPick : (attrs[0] ?? "");
  const hasVersions = state.records.some((r) => r.jobRef === job && r.scoringVersion);
  const [byPick, setBy] = useState<DriftPeriodBy>("month");
  const by: DriftPeriodBy = byPick === "scoringVersion" && !hasVersions ? "month" : byPick;

  const drift = useMemo(() => {
    if (!job || !stage || !attr) return null;
    return computeDrift(
      state.records,
      {
        jobRef: job,
        stage,
        analysisType: "observational",
        groupingAttribute: attr,
        metrics: ["selection_rate", "selection_rate_ratio"],
        confidenceLevel: state.settings.confidenceLevel,
        minimumGroupSize: state.settings.minimumGroupSize,
        impactThreshold: state.settings.impactThreshold,
        alpha: state.settings.alpha,
      },
      by,
    );
  }, [state.records, state.settings, job, stage, attr, by]);

  const comparable = drift?.periods.filter((p) => p.ratio != null) ?? [];
  const chartData = comparable.map((p) => ({
    period: p.period,
    ratio: Number(p.ratio!.toFixed(3)),
    err: p.ratioCi ? [p.ratio! - p.ratioCi.lower, p.ratioCi.upper - p.ratio!] : [0, 0],
    group: p.focusGroup,
  }));

  async function loadSyntheticSeries() {
    const ds = generateDataset({ size: 1000, job: "software", seed: 2026, scenario: "drift" });
    const text = datasetToCsv(ds);
    const { headers, rows } = parseCsv(text);
    const { records, report } = validateAndMap(headers, rows, autoMap(headers));
    const id = newId("imp");
    const existing = new Set(state.records.map((r) => `${r.applicationId}::${r.stage}`));
    const fresh = records.filter((r) => !existing.has(`${r.applicationId}::${r.stage}`)).map((r) => ({ ...r, importId: id }));
    const fileHash = await sha256Hex(text);
    update((s) => ({
      ...s,
      records: [...s.records, ...fresh],
      imports: [
        ...s.imports,
        {
          id,
          fileName: datasetFileName(ds, "csv"),
          fileHash,
          createdAt: new Date().toISOString(),
          createdBy: user.name,
          mapping: autoMap(headers),
          totalRows: report.totalRows,
          importedRows: fresh.length,
          excludedRows: report.excludedRows,
          skippedExisting: records.length - fresh.length,
          issues: report.issues,
          droppedColumns: report.droppedColumns,
          sourceSystems: report.sourceSystems,
          dataType: "synthetic",
        },
      ],
    }));
    log("import.committed", `import:${id}`, `Synthetic drift time series (1,000 candidates, seed 2026)`);
    setJobRef(ds.applications[0]["Job Req ID"] as string);
    setAttrPick("synthetic_group");
  }

  return (
    <>
      <PageHeader title="Bias Drift Monitoring" subtitle="The same deterministic audit, repeated per period, to see whether disparities emerge, persist or close." />
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        No historical production results exist in this demo. Trends shown here come only from imported data — use the labelled synthetic time series to explore the feature.
      </div>

      <section className="card mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="d-job">Job</label>
            <select id="d-job" className="input" value={job} onChange={(e) => setJobRef(e.target.value)} disabled={jobs.size === 0}>
              {[...jobs.entries()].sort().map(([ref, j]) => (
                <option key={ref} value={ref}>
                  {ref} — {j.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="d-stage">Stage</label>
            <select id="d-stage" className="input" value={stage} onChange={(e) => setStagePick(e.target.value)}>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="d-attr">Category</label>
            <select id="d-attr" className="input" value={attr} onChange={(e) => setAttrPick(e.target.value)}>
              {attrs.map((a) => (
                <option key={a} value={a}>
                  {attrLabel(a)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="d-by">Compare by</label>
            <select id="d-by" className="input" value={by} onChange={(e) => setBy(e.target.value as DriftPeriodBy)}>
              <option value="month">Calendar month</option>
              <option value="scoringVersion" disabled={!hasVersions}>
                Scoring version{hasVersions ? "" : " (not in this dataset)"}
              </option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {can("importData") ? (
            <button className="btn btn-secondary" onClick={loadSyntheticSeries}>
              Load labelled synthetic time series
            </button>
          ) : (
            <Restricted what="import data (Admin or Auditor required)" />
          )}
          <span className="text-xs text-ink-2">1,000 fictional candidates, Jan–Jun 2026; scoring v2 from April disadvantages synthetic Group B.</span>
        </div>
      </section>

      {comparable.length < 2 ? (
        <div className="card text-sm text-ink-2">
          Drift needs at least two periods with reportable groups for the selected job, stage and category. {drift && `Found ${comparable.length} of ${drift.periods.length}.`}
        </div>
      ) : (
        <>
          <section className="card mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Lowest impact ratio per {by === "month" ? "month" : "scoring version"}</h2>
              <Badge color="amber">{state.imports.some((i) => i.dataType === "synthetic") ? "Synthetic data" : "Imported data"}</Badge>
            </div>
            <div style={{ width: "100%", height: 280 }} role="img" aria-label="Impact ratio over time with confidence intervals and threshold line">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 16, right: 24, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="period" tickLine={false} fontSize={12} />
                  <YAxis domain={[0, 1.4]} tickLine={false} axisLine={false} width={40} fontSize={12} />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                          <div className="font-semibold">{payload[0].payload.period}</div>
                          <div>
                            {payload[0].payload.group}: ratio <span className="tabular font-semibold">{payload[0].payload.ratio}</span>
                          </div>
                        </div>
                      ) : null
                    }
                  />
                  <ReferenceLine y={state.settings.impactThreshold} strokeDasharray="4 4" label={{ value: `${state.settings.impactThreshold} threshold`, position: "insideTopRight", fontSize: 11 }} />
                  <Line type="linear" dataKey="ratio" stroke="#2a78d6" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false}>
                    <ErrorBar dataKey="err" width={6} strokeWidth={1.5} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-ink-2">Whiskers show {Math.round(state.settings.confidenceLevel * 100)}% intervals. Alerts fire when the ratio crosses the threshold or moves by ≥ {MATERIAL_SHIFT}.</p>
          </section>

          <section className="card mb-6">
            <h2 className="text-sm font-semibold">Alerts ({drift!.alerts.length})</h2>
            {drift!.alerts.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">No threshold crossings or material shifts between consecutive periods.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {drift!.alerts.map((a, i) => (
                  <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${a.kind === "recovered_above_threshold" ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>
                    <strong>{a.period}</strong> — {a.message}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">An alert signals a change worth reviewing. It does not establish why outcomes changed.</p>
          </section>

          <section className="card overflow-x-auto">
            <table className="table tabular text-sm">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>In scope</th>
                  <th>Missing</th>
                  <th>Selection rates</th>
                  <th>Lowest ratio (CI)</th>
                </tr>
              </thead>
              <tbody>
                {drift!.periods.map((p) => (
                  <tr key={p.period}>
                    <td className="font-medium">{p.period}</td>
                    <td>{p.scoped}</td>
                    <td>{p.missingAttribute}</td>
                    <td className="text-xs">{p.rates.map((r) => `${r.group}: ${r.suppressed ? "suppressed" : `${pct(r.rate)} (n=${r.n})`}`).join(" · ")}</td>
                    <td>{p.ratio != null ? `${p.ratio.toFixed(3)}${p.ratioCi ? ` (${p.ratioCi.lower.toFixed(2)}–${p.ratioCi.upper.toFixed(2)})` : ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
