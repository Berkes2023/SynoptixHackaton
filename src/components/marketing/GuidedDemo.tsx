"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScoreHistogram, SelectionRateChart } from "@/components/charts";
import { FindingExplanation } from "@/components/FindingExplanation";
import { Icon } from "@/components/Icon";
import { minimiseForAudit, normaliseDecision, runAudit } from "@/lib/fairness/audit";
import { mean } from "@/lib/fairness/stats";
import type { AuditResult } from "@/lib/fairness/types";
import { canonicalDataset, sha256Hex } from "@/lib/hash";
import { DEMO_EMPLOYER, demoConfig, demoRecords } from "@/lib/site/demo-data";

const STEPS = [
  "Welcome",
  "Applications",
  "ATS scores",
  "Choose a category",
  "Run the analysis",
  "The disparity",
  "Open an investigation",
  "Evidence & limits",
  "Human decision",
  "Report",
] as const;

const RESOLUTIONS = [
  ["remediation_required", "Remediation required — review screening criteria"],
  ["explained_by_job_related_factors", "Explained by documented job-related factors"],
  ["data_quality_issue", "Data-quality issue — re-audit needed"],
  ["inconclusive", "Inconclusive — more data needed"],
] as const;

const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);

export function GuidedDemo() {
  const [step, setStep] = useState(0);
  const [attr, setAttr] = useState<"gender" | "age_band">("gender");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [hash, setHash] = useState("");
  const [running, setRunning] = useState(false);
  const [investigation, setInvestigation] = useState<{ owner: string; openedAt: string } | null>(null);
  const [resolution, setResolution] = useState<string>("");
  const [rationale, setRationale] = useState("");
  const [decided, setDecided] = useState<{ at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const records = useMemo(() => demoRecords().filter((r) => r.jobRef === "REQ-1042" && r.stage === "initial_screening"), []);
  const advanced = records.filter((r) => normaliseDecision(r.decision) === "selected");
  const rejected = records.filter((r) => normaliseDecision(r.decision) === "not_selected");
  const finding = result?.findings.find((f) => f.category === "selection_disparity") ?? result?.findings[0];

  const mounted = useRef(false);
  useEffect(() => {
    // Move focus to the new step's heading for keyboard and screen-reader users (not on first load).
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [step]);

  async function run() {
    setRunning(true);
    const cfg = demoConfig({ groupingAttribute: attr });
    const scoped = minimiseForAudit(demoRecords(), cfg);
    const r = runAudit(scoped, cfg);
    setHash(await sha256Hex(canonicalDataset(scoped)));
    setResult(r);
    setRunning(false);
  }

  function decide() {
    setError(null);
    if (!resolution) return setError("Choose an outcome.");
    if (rationale.trim().length < 20) return setError("Write at least 20 characters explaining the decision.");
    setDecided({ at: new Date().toISOString() });
    setStep(9);
  }

  function downloadReport() {
    if (!result) return;
    const payload = {
      report_format: "dt-demo-report-1.0",
      data_type: "synthetic",
      disclaimer: "Synthetic demonstration. Mock ATS scoring. No determination of unlawful discrimination is made.",
      organisation: `${DEMO_EMPLOYER.name} (fictional)`,
      generated_at: new Date().toISOString(),
      dataset_hash_sha256: hash,
      configuration: result.config,
      methodology_version: result.methodologyVersion,
      sample: result.sample,
      groups: result.groups,
      comparisons: result.comparisons,
      findings: result.findings,
      human_review: { owner: investigation?.owner, resolution, rationale, decided_at: decided?.at },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "deeptrace-demo-report.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const canNext =
    (step !== 4 || result != null) && (step !== 5 || finding != null) && (step !== 6 || investigation != null) && step !== 8 && step < STEPS.length - 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Interactive demo</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Audit a fictional employer&apos;s AI screening</h1>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Synthetic data · mock ATS scoring</span>
      </div>

      <nav aria-label="Demo progress" className="mb-6">
        <ol className="flex gap-1">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                aria-current={i === step ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${s}`}
                className={`h-1.5 w-full rounded-full transition-colors ${i < step ? "bg-brand" : i === step ? "bg-brand/60" : "bg-line"}`}
              />
            </li>
          ))}
        </ol>
        <div className="mt-2 text-xs text-ink-2">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </div>
      </nav>

      <section className="card min-h-[420px] p-6 sm:p-8" aria-live="polite">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          {step + 1}. {STEPS[step]}
        </h2>

        {step === 0 && (
          <div className="mt-4 max-w-3xl space-y-4 text-ink-2">
            <p>
              Meet <strong className="text-ink">{DEMO_EMPLOYER.name}</strong>, {DEMO_EMPLOYER.note}. It uses an AI-assisted applicant tracking system to score and screen
              applicants for a <strong className="text-ink">Software Engineer</strong> role (REQ-1042). {records.length} people applied.
            </p>
            <p>You are the auditor. In ten short steps you will run a real statistical audit of the recorded screening outcomes, investigate what you find and produce a report.</p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 text-good" /> Every number is computed live by DeepTrace&apos;s tested engine.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 text-good" /> All candidates are fictional; scores come from a mock ATS, not Workday or any real vendor.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 text-good" /> Nothing you do here is uploaded or stored.
              </li>
            </ul>
          </div>
        )}

        {step === 1 && (
          <div className="mt-4">
            <p className="max-w-3xl text-ink-2">
              DeepTrace imports what the ATS already recorded. Candidates are pseudonymous — no names or CVs are needed. Self-reported demographic fields are restricted and
              hidden here.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="table tabular text-sm">
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Candidate</th>
                    <th>Applied</th>
                    <th>ATS score</th>
                    <th>Grade</th>
                    <th>Decision</th>
                    <th>Demographics</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 8).map((r) => (
                    <tr key={r.applicationId}>
                      <td>{r.applicationId}</td>
                      <td>{r.candidateRef}</td>
                      <td>{r.appliedAt?.slice(0, 10)}</td>
                      <td>{r.score}</td>
                      <td>{r.grade}</td>
                      <td>{r.decision}</td>
                      <td className="text-muted">🔒 restricted</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Showing 8 of {records.length} fictional applications.</p>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <p className="text-ink-2">
                The mock ATS gave each applicant a score from 0 to 100 and recorded a decision. Advanced applicants generally scored higher — as you would expect. On its own,
                this tells us nothing about fairness between groups.
              </p>
            </div>
            <dl className="tabular grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted">Advanced</dt>
              <dd className="font-semibold">{advanced.length}</dd>
              <dt className="text-muted">Rejected</dt>
              <dd className="font-semibold">{rejected.length}</dd>
              <dt className="text-muted">Mean score (advanced)</dt>
              <dd className="font-semibold">{mean(advanced.map((r) => r.score!)).toFixed(1)}</dd>
              <dt className="text-muted">Mean score (rejected)</dt>
              <dd className="font-semibold">{mean(rejected.map((r) => r.score!)).toFixed(1)}</dd>
            </dl>
          </div>
        )}

        {step === 3 && (
          <div className="mt-4 max-w-3xl">
            <p className="text-ink-2">
              Choose which self-reported category to compare. DeepTrace only uses categories the organisation is authorised to analyse, and never guesses them from names or
              CVs.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["gender", "Gender (self-reported)", "Compare selection rates between gender groups."],
                  ["age_band", "Age band (self-reported)", "Compare under-40 and 40-and-over applicants."],
                ] as const
              ).map(([k, t, d]) => (
                <label key={k} className={`cursor-pointer rounded-xl border p-4 ${attr === k ? "border-brand bg-brand-soft" : "border-line bg-surface-2"}`}>
                  <input
                    type="radio"
                    name="demo-attr"
                    className="mr-2"
                    checked={attr === k}
                    onChange={() => {
                      setAttr(k);
                      setResult(null);
                      setInvestigation(null);
                    }}
                  />
                  <span className="font-medium">{t}</span>
                  <span className="mt-1 block text-sm text-ink-2">{d}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="mt-4">
            <p className="max-w-3xl text-ink-2">
              DeepTrace will compute selection rates with confidence intervals, the impact ratio, a Fisher exact test and a score comparison — then correct for running several
              tests at once.
            </p>
            <button className="btn btn-primary btn-lg mt-5" onClick={run} disabled={running}>
              {running ? "Running…" : result ? "Run again" : "Run the audit"}
            </button>
            {result && (
              <dl className="tabular mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Applicants in scope</dt>
                  <dd className="text-lg font-semibold">{result.sample.scopedRecords}</dd>
                </div>
                <div>
                  <dt className="text-muted">Analysed</dt>
                  <dd className="text-lg font-semibold">{result.sample.analysed}</dd>
                </div>
                <div>
                  <dt className="text-muted">Missing category</dt>
                  <dd className="text-lg font-semibold">{result.sample.missingAttribute}</dd>
                </div>
                <div>
                  <dt className="text-muted">Dataset SHA-256</dt>
                  <dd className="font-mono text-xs">{hash.slice(0, 16)}…</dd>
                </div>
              </dl>
            )}
          </div>
        )}

        {step === 5 && result && (
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              {result.groups.some((g) => !g.suppressed) && <SelectionRateChart result={result} height={260} />}
              <ScoreHistogram result={result} height={200} />
            </div>
            <div className="space-y-3 text-sm">
              {result.groups.map((g) => (
                <div key={g.group} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                  <span className="font-medium">{g.group}</span>:{" "}
                  {g.suppressed ? "suppressed (too few to report)" : `${g.selected} of ${g.n} advanced (${pct(g.selectionRate)})`}
                </div>
              ))}
              {finding ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900">
                  <div className="font-semibold">{finding.title}</div>
                  <p className="mt-1">{finding.summary}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-900">
                  No disparity met the flagging rules for this category. That is not a certificate of fairness. Go back and try gender to continue the walkthrough.
                </div>
              )}
            </div>
          </div>
        )}

        {step === 6 && finding && (
          <div className="mt-4 max-w-3xl">
            <p className="text-ink-2">A finding is a prompt for human review — not a conclusion. Assign it to a reviewer who will examine the evidence.</p>
            {investigation ? (
              <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                ✓ Investigation opened and assigned to <strong>{investigation.owner}</strong> (Reviewer) at {new Date(investigation.openedAt).toLocaleTimeString("en-GB")}.
              </div>
            ) : (
              <button className="btn btn-primary btn-lg mt-5" onClick={() => setInvestigation({ owner: "Jordan Lee", openedAt: new Date().toISOString() })}>
                Open investigation &amp; assign to Jordan Lee
              </button>
            )}
          </div>
        )}

        {step === 7 && finding && (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div>
              <div className="label">Evidence</div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {finding.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <div className="label mt-4">Limitations</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                {finding.limitations.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
            <div>
              <FindingExplanation explanation={finding.explanation} />
            </div>
          </div>
        )}

        {step === 8 && (
          <div className="mt-4 max-w-3xl">
            <p className="text-ink-2">
              As the reviewer, record what you concluded and why. In this fictional scenario, imagine you checked the screening configuration and found a knock-out question
              that filtered out more applicants from one group.
            </p>
            <fieldset className="mt-4 space-y-2">
              <legend className="label">Outcome</legend>
              {RESOLUTIONS.map(([k, label]) => (
                <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${resolution === k ? "border-brand bg-brand-soft" : "border-line bg-surface-2"}`}>
                  <input type="radio" name="demo-res" checked={resolution === k} onChange={() => setResolution(k)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="label mt-4" htmlFor="demo-rat">Rationale</label>
            <textarea id="demo-rat" className="input min-h-[96px]" value={rationale} onChange={(e) => setRationale(e.target.value)} maxLength={1000} placeholder="What did you check, and what does the evidence support?" />
            {error && <p className="mt-2 text-sm text-critical">{error}</p>}
            <button className="btn btn-primary mt-4" onClick={decide}>
              Sign off as Jordan Lee (Reviewer)
            </button>
          </div>
        )}

        {step === 9 && result && (
          <div className="mt-4">
            <div className="rounded-xl border border-line bg-surface-2 p-5">
              <div className="eyebrow">Sample audit report</div>
              <h3 className="mt-1 text-lg font-semibold">Software Engineer — initial screening, by {attr === "gender" ? "gender" : "age band"}</h3>
              <p className="mt-1 text-xs text-ink-2">
                {DEMO_EMPLOYER.name} (fictional) · dataset {hash.slice(0, 16)}… · methodology {result.methodologyVersion}
              </p>
              <p className="mt-3 text-sm">{result.conclusion}</p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {result.groups.map((g) => (
                  <div key={g.group}>
                    {g.group}: {g.suppressed ? "suppressed" : `${g.selected}/${g.n} (${pct(g.selectionRate)})`}
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-line pt-3 text-sm">
                <strong>Human review:</strong> {RESOLUTIONS.find(([k]) => k === resolution)?.[1]} — &ldquo;{rationale}&rdquo; — Jordan Lee (Reviewer)
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={downloadReport}>
                Download report (JSON)
              </button>
              <Link href="/imports" className="btn btn-secondary">
                Continue in the full workspace
              </Link>
              <Link href="/contact" className="btn btn-ghost">
                Talk to us
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted">The full workspace adds printable executive reports, an audit trail, drift monitoring and the Counterfactual Studio.</p>
          </div>
        )}
      </section>

      <div className="mt-6 flex items-center justify-between">
        <button className="btn btn-secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          ← Back
        </button>
        {step < STEPS.length - 1 && step !== 8 && (
          <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Next: {STEPS[step + 1]} →
          </button>
        )}
      </div>
    </div>
  );
}
