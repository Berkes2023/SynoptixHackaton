"use client";

import Link from "next/link";
import { SelectionRateChart } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { EmptyState, FlagBadge, PageHeader, SeverityBadge, Stat, SyntheticNotice, attrLabel, stageLabel } from "@/components/ui";
import { useStore } from "@/lib/store";

const severityOrder = { high: 0, medium: 1, low: 2, info: 3 } as const;

export default function DashboardPage() {
  const { state } = useStore();
  const applicants = new Set(state.records.map((r) => r.candidateRef)).size;
  const toReview = state.findings.filter((f) => f.status !== "resolved" && f.status !== "inconclusive" && f.severity !== "info");
  const closed = state.investigations.filter((i) => i.status === "resolved" || i.status === "inconclusive").length;
  const latest = state.audits[state.audits.length - 1];

  const steps = [
    { label: "Import dataset", done: state.imports.length > 0, href: "/imports" },
    { label: "Run audit", done: state.audits.length > 0, href: "/audits/new" },
    { label: "Open investigation", done: state.investigations.length > 0, href: "/investigations" },
    { label: "Record resolution", done: closed > 0, href: "/investigations" },
    { label: "Generate report", done: state.reports.length > 0, href: "/reports" },
  ];
  const next = steps.find((s) => !s.done);

  const { update } = useStore();
  const dismiss = () => update((s) => ({ ...s, onboardingDismissed: true }));

  return (
    <>
      <PageHeader title="Recruitment Fairness Overview" subtitle="Independent audit of ATS screening outcomes — trace the decision, detect the bias, strengthen accountability." />
      <div className="mb-6">
        <SyntheticNotice />
      </div>

      {!state.onboardingDismissed && state.audits.length === 0 && (
        <section className="card mb-6 border-brand/30" aria-labelledby="welcome-h">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow">Welcome</div>
              <h2 id="welcome-h" className="mt-1 text-lg font-semibold">
                Your fairness-audit workspace
              </h2>
              <p className="mt-2 text-sm text-ink-2">
                DeepTrace examines screening outcomes your ATS has already recorded, flags potential disparities for human review, and documents what reviewers decide. This
                workspace lives in your browser and contains only the data you load.
              </p>
            </div>
            <button className="btn btn-ghost self-start text-xs" onClick={dismiss}>
              Skip introduction
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Link href="/demo" className="rounded-xl border border-line bg-surface-2 p-4 hover:border-brand">
              <div className="flex items-center gap-2 font-medium">
                <Icon name="play" className="h-4 w-4 text-brand" /> Take the guided demo
              </div>
              <p className="mt-1 text-xs text-ink-2">Ten steps, about two minutes, fictional data.</p>
            </Link>
            <Link href="/imports" className="rounded-xl border border-line bg-surface-2 p-4 hover:border-brand">
              <div className="flex items-center gap-2 font-medium">
                <Icon name="upload" className="h-4 w-4 text-brand" /> Import or generate data
              </div>
              <p className="mt-1 text-xs text-ink-2">Use the sample export, generate a synthetic dataset, or upload a pseudonymised CSV/JSON.</p>
            </Link>
            <Link href="/audits/new" className="rounded-xl border border-line bg-surface-2 p-4 hover:border-brand">
              <div className="flex items-center gap-2 font-medium">
                <Icon name="chart" className="h-4 w-4 text-brand" /> Configure an audit
              </div>
              <p className="mt-1 text-xs text-ink-2">Pick one job, one stage and an authorised self-reported category.</p>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">Tip: press Ctrl K (⌘K on Mac) anywhere in the workspace to search pages, jobs, audits and findings.</p>
        </section>
      )}

      <section className="card mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Demo journey</div>
            <p className="text-xs text-ink-2">Upload → validate → audit → investigate → report.</p>
          </div>
          {next && (
            <Link href={next.href} className="btn btn-primary">
              Next: {next.label} →
            </Link>
          )}
        </div>
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {steps.map((s, i) => (
            <li key={s.label} className={`rounded-md border px-3 py-2 text-xs ${s.done ? "border-green-200 bg-green-50 text-green-900" : "border-line bg-white text-ink-2"}`}>
              <span className="font-semibold">{s.done ? "✓" : i + 1}</span> {s.label}
            </li>
          ))}
        </ol>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Applicants assessed" value={applicants.toLocaleString("en-GB")} hint="Across imported records" />
        <Stat label="Audits completed" value={state.audits.length} hint="Reproducible, versioned runs" />
        <Stat label="Findings to review" value={toReview.length} hint="Human investigation required" />
        <Stat label="Investigations closed" value={closed} hint="With reviewer records" />
      </div>

      {state.records.length === 0 ? (
        <EmptyState
          title="No screening data yet"
          body="Load the synthetic Workday-style dataset (325 records, 2 requisitions) to see the full audit journey."
          href="/imports"
          cta="Go to Data Hub"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="card lg:col-span-3">
            <h2 className="text-sm font-semibold">Findings requiring investigation</h2>
            {toReview.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">No open findings. {state.audits.length === 0 && <Link className="text-brand underline" href="/audits/new">Run an audit</Link>}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {[...toReview]
                  .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
                  .map((f) => {
                    const audit = state.audits.find((a) => a.id === f.auditId);
                    return (
                      <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {audit?.jobTitle} — {stageLabel(audit?.result.config.stage ?? "")}
                          </div>
                          <div className="truncate text-xs text-ink-2">{f.title}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={f.severity} />
                          <Link href={`/audits/${f.auditId}#${f.id}`} className="btn btn-secondary px-2.5 py-1 text-xs">
                            Review
                          </Link>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
          <section className="card lg:col-span-2">
            <h2 className="text-sm font-semibold">Latest audit</h2>
            {latest ? (
              <>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-2">
                  <span>
                    {latest.jobTitle} · {stageLabel(latest.result.config.stage)} · {attrLabel(latest.result.config.groupingAttribute)}
                  </span>
                  <FlagBadge flag={latest.result.flag} />
                </div>
                {latest.result.groups.some((g) => !g.suppressed) ? (
                  <SelectionRateChart result={latest.result} height={220} />
                ) : (
                  <p className="mt-4 text-sm text-ink-2">All groups suppressed — nothing reportable.</p>
                )}
                <Link href={`/audits/${latest.id}`} className="text-sm text-brand underline">
                  Open audit
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-2">No audits run yet.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
