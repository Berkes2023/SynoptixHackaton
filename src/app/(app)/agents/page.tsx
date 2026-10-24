"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { WorkflowDetail } from "@/components/agents/WorkflowDetail";
import { STATE_COLOR } from "@/components/agents/WorkflowGraph";
import { Badge, EmptyState, PageHeader, Restricted, attrLabel, fmtDate, stageLabel } from "@/components/ui";
import { AGENTS } from "@/lib/agents/agents";
import { AGENT_TYPES } from "@/lib/agents/contracts";
import { AGENT_CAPABILITIES } from "@/lib/agents/policy";
import { useWorkflowRunner } from "@/lib/agents/runner";
import { SUPPORTED_AUDIT_ATTRIBUTES } from "@/lib/fairness/audit";
import { useStore } from "@/lib/store";

function Observatory() {
  const { state, can } = useStore();
  const runner = useWorkflowRunner();
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

  const initialJob = params.get("job") && jobs.has(params.get("job")!) ? params.get("job")! : ([...jobs.keys()].sort()[0] ?? "");
  const [jobRef, setJobRef] = useState(initialJob);
  const job = jobs.has(jobRef) ? jobRef : initialJob;
  const stages = [...(jobs.get(job)?.stages ?? [])];
  const [stagePick, setStage] = useState(params.get("stage") ?? "initial_screening");
  const stage = stages.includes(stagePick) ? stagePick : (stages[0] ?? "");
  const available = SUPPORTED_AUDIT_ATTRIBUTES.filter((a) => state.settings.authorisedAttributes.includes(a) && state.records.some((r) => r.jobRef === job && r.sensitive[a] != null));
  const [attrs, setAttrs] = useState<string[]>(params.get("attr") ? [params.get("attr")!] : []);
  const chosen = attrs.filter((a) => (available as readonly string[]).includes(a));
  const effectiveAttrs = chosen.length ? chosen : available.slice(0, 1);
  const [objective, setObjective] = useState("Examine screening outcomes for group disparities, test sensitivity to irrelevant cues and verify the evidence.");
  const [experiments, setExperiments] = useState(true);
  const [mitigation, setMitigation] = useState(true);
  const [stepThrough, setStepThrough] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workflows = [...state.workflows].reverse();
  const current = state.workflows.find((w) => w.id === selected) ?? workflows[0] ?? null;

  const stats = AGENT_TYPES.map((a) => {
    const tasks = state.workflows.flatMap((w) => w.tasks.filter((t) => t.agent === a));
    const done = tasks.filter((t) => t.result);
    return {
      a,
      runs: tasks.length,
      failures: tasks.reduce((s, t) => s + t.errors.length, 0),
      avgMs: done.length ? done.reduce((s, t) => s + (t.result?.durationMs ?? 0), 0) / done.length : null,
    };
  });

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const run = await runner.start(
        { objective, jobRef: job, stage, attributes: effectiveAttrs, runExperiments: experiments, runMitigation: experiments && mitigation, externalAts: false, externalModelProvider: false },
        stepThrough,
      );
      setSelected(run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the workflow.");
    } finally {
      setBusy(false);
    }
  }

  async function wrap<T>(fn: () => Promise<T> | T) {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Agent Observatory"
        subtitle="Bounded multi-agent audit workflows: every card, node and timestamp below comes from persisted execution records."
      />
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Synthetic demo data. All eight agents are <strong>deterministic services</strong> — no language model is called, so model cost is $0. Experiments target DeepTrace&apos;s mock
        engine only; no external ATS is contacted.
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-sm font-semibold">Start an audit workflow</h2>
            {jobs.size === 0 ? (
              <p className="mt-2 text-sm text-ink-2">
                Import data first in the <a className="text-brand underline" href="/imports">Data Hub</a>.
              </p>
            ) : !can("runAudit") ? (
              <div className="mt-2">
                <Restricted what="start audits (Admin or Auditor required)" />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="label" htmlFor="o-job">Job</label>
                  <select id="o-job" className="input" value={job} onChange={(e) => setJobRef(e.target.value)}>
                    {[...jobs.entries()].sort().map(([ref, j]) => (
                      <option key={ref} value={ref}>
                        {ref} — {j.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="o-stage">Stage</label>
                  <select id="o-stage" className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
                    {stages.map((s) => (
                      <option key={s} value={s}>
                        {stageLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset>
                  <legend className="label">Authorised categories</legend>
                  {available.length === 0 && <p className="text-xs text-ink-2">No authorised self-reported category exists for this job.</p>}
                  {available.map((a) => (
                    <label key={a} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={effectiveAttrs.includes(a)} onChange={(e) => setAttrs(e.target.checked ? [...effectiveAttrs, a] : effectiveAttrs.filter((x) => x !== a))} />
                      {attrLabel(a)}
                    </label>
                  ))}
                </fieldset>
                <div>
                  <label className="label" htmlFor="o-obj">Approved objective</label>
                  <textarea id="o-obj" className="input min-h-[72px]" value={objective} maxLength={500} onChange={(e) => setObjective(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={experiments} onChange={(e) => setExperiments(e.target.checked)} /> Counterfactual experiments (mock engine)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={mitigation && experiments} disabled={!experiments} onChange={(e) => setMitigation(e.target.checked)} /> Mitigation experiments
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={stepThrough} onChange={(e) => setStepThrough(e.target.checked)} /> Pause after each task (step through)
                </label>
                {error && <p className="text-sm text-critical">{error}</p>}
                <button className="btn btn-primary w-full" onClick={start} disabled={busy || !stage || effectiveAttrs.length === 0 || objective.trim().length < 10}>
                  {busy ? "Running…" : "Start workflow"}
                </button>
                <p className="text-[11px] text-muted">External ATS testing and external AI providers are not available in this deployment; policy denies them.</p>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold">Workflows ({workflows.length})</h2>
            {workflows.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">None yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {workflows.map((w) => (
                  <li key={w.id}>
                    <button className={`w-full px-1 py-2 text-left text-sm ${current?.id === w.id ? "font-medium text-brand" : ""}`} onClick={() => setSelected(w.id)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {w.request.jobRef} · {stageLabel(w.request.stage)}
                        </span>
                        <Badge color={STATE_COLOR[w.state]}>{w.state.replace("_", " ")}</Badge>
                      </div>
                      <div className="text-xs text-muted">{fmtDate(w.createdAt)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          {current ? (
            <WorkflowDetail
              run={current}
              busy={busy}
              onResume={() => wrap(() => runner.resume(current, stepThrough))}
              onCancel={() => wrap(() => runner.cancel(current))}
              onDecide={async (d, rationale) => {
                try {
                  await wrap(() => runner.approve(current, d, rationale));
                  return null;
                } catch (e) {
                  return e instanceof Error ? e.message : "Decision failed.";
                }
              }}
            />
          ) : (
            <EmptyState title="No workflows yet" body="Start an audit workflow to see the agents' tasks, evidence, conflicts and review gates." />
          )}

          <section className="card">
            <h2 className="text-sm font-semibold">Agent roster</h2>
            <p className="text-xs text-ink-2">Counts come from persisted task records in this workspace.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {stats.map(({ a, runs, failures, avgMs }) => (
                <div key={a} className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{AGENTS[a].name}</span>
                    <span className="font-mono text-[11px] text-muted">v{AGENTS[a].version}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-2">{AGENTS[a].purpose}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <Badge>{AGENTS[a].kind}</Badge>
                    <Badge>access: {AGENT_CAPABILITIES[a].join(", ").replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="tabular mt-2 text-xs text-ink-2">
                    {runs} task run(s) · {failures} failed attempt(s) · {avgMs != null ? `${avgMs.toFixed(1)} ms avg` : "no runs yet"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense>
      <Observatory />
    </Suspense>
  );
}
