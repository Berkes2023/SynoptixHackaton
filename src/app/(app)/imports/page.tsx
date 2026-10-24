"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, PageHeader, Restricted, SyntheticNotice, fmtDate, shortHash } from "@/components/ui";
import { SYNTHETIC_DATASET_NAME } from "@/lib/data/synthetic";
import { parseCsv } from "@/lib/ingest/csv";
import { STANDARD_FIELDS, autoMap, type Mapping } from "@/lib/ingest/mapping";
import { validateAndMap } from "@/lib/ingest/validate";
import { sha256Hex } from "@/lib/hash";
import {
  GENERATOR_SIZES,
  JOB_CATEGORIES,
  SCENARIOS,
  datasetFileName,
  datasetToCsv,
  datasetToJson,
  generateDataset,
  jsonToTable,
  type GeneratedDataset,
  type GeneratorOptions,
} from "@/lib/data/generator";
import { newId, useStore, type ImportBatch } from "@/lib/store";

interface Draft {
  fileName: string;
  fileHash: string;
  headers: string[];
  rows: string[][];
  mapping: Mapping;
  synthetic: boolean;
}

export default function ImportsPage() {
  const { state, update, log, can, user } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<ImportBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [gen, setGen] = useState<GeneratorOptions>({ size: 250, job: "software", seed: 2026, scenario: "selection_disparity" });
  const [generated, setGenerated] = useState<GeneratedDataset | null>(null);

  const validation = useMemo(() => (draft && validated ? validateAndMap(draft.headers, draft.rows, draft.mapping) : null), [draft, validated]);
  const canImport = can("importData");
  const canSeeSensitive = can("viewRawSensitive");

  async function loadText(text: string, fileName: string, synthetic: boolean) {
    setError(null);
    setCommitted(null);
    setValidated(false);
    let headers: string[];
    let rows: string[][];
    try {
      ({ headers, rows } = /\.json$/i.test(fileName) ? jsonToTable(text) : parseCsv(text));
    } catch (e) {
      setError(e instanceof Error ? `Could not read the file: ${e.message}` : "Could not read the file.");
      return;
    }
    if (headers.length === 0 || rows.length === 0) {
      setError("The file has no header row or no data rows.");
      return;
    }
    if (rows.length > 20000) {
      setError("This demo accepts up to 20,000 rows per file.");
      return;
    }
    setDraft({ fileName, fileHash: await sha256Hex(text), headers, rows, mapping: autoMap(headers), synthetic });
    log("import.uploaded", `file:${fileName}`, `${rows.length} rows, ${headers.length} columns`);
  }

  async function useSample() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/sample-dataset");
      await loadText(await res.text(), SYNTHETIC_DATASET_NAME, true);
    } catch {
      setError("Could not load the sample dataset.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(csv|json)$/i.test(file.name)) return setError("Only .csv and .json files are supported.");
    if (file.size > 10 * 1024 * 1024) return setError("Files over 10 MB are not supported in the demo.");
    await loadText(await file.text(), file.name, false);
  }

  function generate() {
    const ds = generateDataset(gen);
    setGenerated(ds);
    log("dataset.generated", `generator:${gen.job}/${gen.scenario}`, `${gen.size} candidates, seed ${gen.seed}`);
  }

  function download(text: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function deleteImport(batch: ImportBatch) {
    if (!window.confirm(`Delete "${batch.fileName}" and its ${batch.importedRows} records from this workspace? Audit results already generated are kept as historical records.`)) return;
    update((s) => ({ ...s, records: s.records.filter((r) => r.importId !== batch.id), imports: s.imports.filter((i) => i.id !== batch.id) }));
    log("import.deleted", `import:${batch.id}`, `${batch.fileName}; ${batch.importedRows} records removed`);
  }

  function commit() {
    if (!draft || !validation) return;
    const existing = new Set(state.records.map((r) => `${r.applicationId}::${r.stage}`));
    const id = newId("imp");
    const fresh = validation.records.filter((r) => !existing.has(`${r.applicationId}::${r.stage}`)).map((r) => ({ ...r, importId: id }));
    const batch: ImportBatch = {
      id,
      fileName: draft.fileName,
      fileHash: draft.fileHash,
      createdAt: new Date().toISOString(),
      createdBy: user.name,
      mapping: draft.mapping,
      totalRows: validation.report.totalRows,
      importedRows: fresh.length,
      excludedRows: validation.report.excludedRows,
      skippedExisting: validation.records.length - fresh.length,
      issues: validation.report.issues,
      droppedColumns: validation.report.droppedColumns,
      sourceSystems: validation.report.sourceSystems,
      dataType: draft.synthetic ? "synthetic" : "customer",
    };
    update((s) => ({ ...s, records: [...s.records, ...fresh], imports: [...s.imports, batch] }));
    log("import.committed", `import:${id}`, `${fresh.length} records persisted; file sha256 ${draft.fileHash.slice(0, 16)}`);
    setCommitted(batch);
    setDraft(null);
    setValidated(false);
  }

  const columnFor = (key: string) => (draft?.mapping[key] ? draft.headers.indexOf(draft.mapping[key]!) : -1);

  return (
    <>
      <PageHeader title="ATS Data Hub" subtitle="Upload screening exports, map them to DeepTrace's standard schema and validate before anything is stored." />
      <div className="mb-6">
        <SyntheticNotice compact />
      </div>

      {committed && (
        <div className="card mb-6 border-green-200 bg-green-50">
          <div className="text-sm font-semibold text-green-900">✓ Import committed — {committed.importedRows} records stored</div>
          <p className="mt-1 text-xs text-green-900">
            {committed.excludedRows} rows excluded by validation · {committed.skippedExisting} already present · file SHA-256 {shortHash(committed.fileHash)}
          </p>
          <div className="mt-3 flex gap-2">
            <Link href="/audits/new" className="btn btn-primary">
              Run a fairness audit →
            </Link>
            <Link href="/jobs" className="btn btn-secondary">
              View jobs
            </Link>
          </div>
        </div>
      )}

      <section className="card mb-6">
        <h2 className="text-sm font-semibold">1 · Choose a source</h2>
        {!canImport ? (
          <div className="mt-3">
            <Restricted what="import data (Admin or Auditor required)" />
          </div>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-brand/30 bg-brand-soft p-4">
              <div className="text-sm font-medium">Synthetic Workday-style export</div>
              <p className="mt-1 text-xs text-ink-2">325 fictional screening events across 2 requisitions, generated deterministically.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={useSample} disabled={busy}>
                  {busy ? "Loading…" : "Use sample dataset"}
                </button>
                <a className="btn btn-secondary" href="/api/v1/sample-dataset">
                  Download CSV
                </a>
              </div>
            </div>
            <label
              className={`flex cursor-pointer flex-col justify-center rounded-lg border border-dashed p-4 transition-colors ${dragging ? "border-brand bg-brand-soft" : "border-line bg-surface-2 hover:bg-sunken"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                onFile(e.dataTransfer.files?.[0]);
              }}
            >
              <span className="text-sm font-medium">Drop a CSV or JSON export here, or browse</span>
              <span className="mt-1 text-xs text-ink-2">Approved, pseudonymised exports only. Max 10 MB / 20,000 rows. Parsed in your browser; stored only in this demo workspace.</span>
              <input type="file" accept=".csv,.json,text/csv,application/json" className="mt-3 text-xs" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        )}
        {canImport && (
          <details className="mt-4 rounded-lg border border-line bg-surface-2">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Generate a synthetic dataset</summary>
            <div className="border-t border-line p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="label" htmlFor="g-size">Candidates</label>
                  <select id="g-size" className="input" value={gen.size} onChange={(e) => setGen({ ...gen, size: Number(e.target.value) as GeneratorOptions["size"] })}>
                    {GENERATOR_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s.toLocaleString("en-GB")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="g-job">Job category</label>
                  <select id="g-job" className="input" value={gen.job} onChange={(e) => setGen({ ...gen, job: e.target.value as GeneratorOptions["job"] })}>
                    {Object.entries(JOB_CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="g-scn">Scenario</label>
                  <select id="g-scn" className="input" value={gen.scenario} onChange={(e) => setGen({ ...gen, scenario: e.target.value as GeneratorOptions["scenario"] })}>
                    {Object.entries(SCENARIOS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="g-seed">Seed</label>
                  <input id="g-seed" type="number" className="input" value={gen.seed} onChange={(e) => setGen({ ...gen, seed: Number(e.target.value) || 1 })} />
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-2">{SCENARIOS[gen.scenario].description} Groups are an abstract synthetic audit category (Group A / Group B), not a real characteristic.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={generate}>
                  Generate
                </button>
                {generated && (
                  <>
                    <button className="btn btn-secondary" onClick={() => loadText(datasetToCsv(generated), datasetFileName(generated, "csv"), true)}>
                      Load into import →
                    </button>
                    <button className="btn btn-secondary" onClick={() => download(datasetToCsv(generated), datasetFileName(generated, "csv"), "text/csv")}>
                      Download CSV
                    </button>
                    <button className="btn btn-secondary" onClick={() => download(datasetToJson(generated), datasetFileName(generated, "json"), "application/json")}>
                      Download JSON
                    </button>
                  </>
                )}
              </div>
              {generated && (
                <p className="mt-2 text-xs text-ink-2" aria-live="polite">
                  Generated {generated.candidates.length.toLocaleString("en-GB")} candidates and {generated.applications.length.toLocaleString("en-GB")} screening events for requisition{" "}
                  {generated.applications[0]["Job Req ID"]}.
                </p>
              )}
            </div>
          </details>
        )}
        {error && <p className="mt-3 text-sm text-critical">{error}</p>}
      </section>

      {draft && (
        <section className="card mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">2 · Map fields</h2>
            <span className="text-xs text-ink-2">
              {draft.fileName} · {draft.rows.length} rows · SHA-256 {shortHash(draft.fileHash)}
            </span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>DeepTrace field</th>
                  <th>Source column</th>
                  <th>Example</th>
                </tr>
              </thead>
              <tbody>
                {STANDARD_FIELDS.map((f) => {
                  const idx = columnFor(f.key);
                  const example = idx >= 0 ? draft.rows[0]?.[idx] : "";
                  return (
                    <tr key={f.key}>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {f.label}
                          {f.required && <Badge>required</Badge>}
                          {f.sensitive && <Badge color="amber">🔒 restricted</Badge>}
                        </div>
                      </td>
                      <td className="min-w-48">
                        <select
                          className="input py-1.5"
                          value={draft.mapping[f.key] ?? ""}
                          onChange={(e) => {
                            setValidated(false);
                            setDraft({ ...draft, mapping: { ...draft.mapping, [f.key]: e.target.value || null } });
                          }}
                        >
                          <option value="">— not mapped —</option>
                          {draft.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="text-xs text-ink-2">{f.sensitive && !canSeeSensitive && example ? "•••• (restricted)" : example || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-2">
            Unmapped columns are dropped and never stored (data minimisation). Protected characteristics are only accepted from self-reported fields — never inferred.
          </p>
          <button className="btn btn-primary mt-4" onClick={() => setValidated(true)}>
            Validate &amp; preview
          </button>
        </section>
      )}

      {draft && validation && (
        <section className="card mb-6">
          <h2 className="text-sm font-semibold">3 · Validation report</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Rows in file", validation.report.totalRows],
              ["Valid rows", validation.report.validRows],
              ["Excluded rows", validation.report.excludedRows],
              ["Dropped columns", validation.report.droppedColumns.length],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-line bg-white px-3 py-2">
                <div className="text-xs text-ink-2">{k}</div>
                <div className="tabular text-xl font-semibold">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-xs text-ink-2">
            Source systems: {validation.report.sourceSystems.join(", ") || "—"} · Jobs:{" "}
            {validation.report.jobs.map((j) => `${j.jobRef} ${j.jobTitle} (${j.rows})`).join(", ") || "—"}
            {validation.report.droppedColumns.length > 0 && <> · Dropped: {validation.report.droppedColumns.join(", ")}</>}
          </div>
          {validation.report.issues.length === 0 ? (
            <p className="mt-4 text-sm text-green-800">✓ No issues found.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {validation.report.issues.map((i) => (
                <li key={i.code} className={`rounded-md border px-3 py-2 text-sm ${i.severity === "error" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={i.severity === "error" ? "red" : "amber"}>{i.severity === "error" ? "▲ Error — row excluded" : "● Warning — row kept"}</Badge>
                    <span>{i.message}</span>
                  </div>
                  {i.rows.length > 0 && (
                    <div className="mt-1 text-xs text-ink-2">
                      {i.rows.length} row(s): {i.rows.slice(0, 12).join(", ")}
                      {i.rows.length > 12 && "…"}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {validation.records.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-2">Preview (first 6 mapped records)</div>
              <table className="table tabular text-xs">
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Job</th>
                    <th>Stage</th>
                    <th>Score</th>
                    <th>Decision</th>
                    <th>Decision at</th>
                    <th>Sensitive</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.records.slice(0, 6).map((r) => (
                    <tr key={r.applicationId + r.stage}>
                      <td>{r.applicationId}</td>
                      <td>{r.jobRef}</td>
                      <td>{r.stage}</td>
                      <td>{r.score ?? "—"}</td>
                      <td>{r.decision}</td>
                      <td>{r.decisionAt.slice(0, 10)}</td>
                      <td>{canSeeSensitive ? Object.values(r.sensitive).map((v) => v ?? "missing").join(" / ") : "🔒 restricted"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={validation.report.blocking || !canImport} onClick={commit}>
              Commit {validation.records.length} records
            </button>
            {validation.report.blocking && <span className="text-xs text-critical">Fix the mapping errors above before committing.</span>}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="text-sm font-semibold">Import history</h2>
        {state.imports.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">No imports yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th>When</th>
                  <th>File</th>
                  <th>Type</th>
                  <th>Imported</th>
                  <th>Excluded</th>
                  <th>File SHA-256</th>
                  <th>By</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...state.imports].reverse().map((b) => (
                  <tr key={b.id}>
                    <td>{fmtDate(b.createdAt)}</td>
                    <td>{b.fileName}</td>
                    <td>{b.dataType === "synthetic" ? <Badge color="amber">Synthetic</Badge> : <Badge>Uploaded</Badge>}</td>
                    <td className="tabular">{b.importedRows}</td>
                    <td className="tabular">{b.excludedRows}</td>
                    <td className="font-mono">{shortHash(b.fileHash)}</td>
                    <td>{b.createdBy}</td>
                    <td className="text-right">
                      {can("deleteData") && (
                        <button className="text-xs text-critical underline" onClick={() => deleteImport(b)} aria-label={`Delete dataset ${b.fileName}`}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
