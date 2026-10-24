"use client";

import Link from "next/link";
import { useState } from "react";
import { AGENTS } from "@/lib/agents/agents";
import { TERMINAL_STATES, type WorkflowRun } from "@/lib/agents/contracts";
import { Badge, fmtDate } from "@/components/ui";
import { STATE_COLOR, WorkflowGraph } from "./WorkflowGraph";

type Verdict = { hypothesisId: string; verdict: string; reasons: string[] };
type Section = { category: string; text: string; evidenceRefs: string[] };

const CATEGORY_LABEL: Record<string, string> = {
  supported_finding: "Supported by evidence",
  observed_disparity: "Observed, not established",
  experimental_sensitivity: "Experimental sensitivity (mock engine)",
  mechanism_hypothesis: "Hypothesis about mechanism",
  human_question: "Question for human investigation",
  limitation: "Limitation",
};

export function WorkflowDetail({
  run,
  busy,
  onResume,
  onCancel,
  onDecide,
  demoNote,
}: {
  run: WorkflowRun;
  busy?: boolean;
  onResume?: () => void;
  onCancel?: () => void;
  onDecide?: (decision: "approved" | "rejected", rationale: string) => Promise<string | null>;
  demoNote?: string;
}) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const task = run.tasks.find((t) => t.taskId === taskId) ?? null;
  const pending = run.approvals.find((a) => a.status === "pending");
  const terminal = TERMINAL_STATES.includes(run.state);
  const verdicts = ((run.evidence["ev:verification"] as { verdicts: Verdict[] } | undefined)?.verdicts ?? []) as Verdict[];
  const sections = ((run.evidence["ev:explanation"] as { sections: Section[] } | undefined)?.sections ?? []) as Section[];
  const canContinue = !terminal && run.state !== "AWAITING_REVIEW" && !busy;

  function exportHistory() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `deeptrace-workflow-${run.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function decide(d: "approved" | "rejected") {
    setError(null);
    const err = await onDecide?.(d, rationale);
    if (err) setError(err);
    else setRationale("");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={STATE_COLOR[run.state]}>{run.state.replace("_", " ")}</Badge>
            {run.linkedAuditId && (
              <Link href={`/audits/${run.linkedAuditId}`} className="text-xs text-brand underline">
                Open linked audit in Audit Lab
              </Link>
            )}
          </div>
          <p className="mt-2 text-sm">{run.request.objective}</p>
          <p className="mt-1 text-xs text-ink-2">
            {run.request.jobRef} · {run.request.stage.replace(/_/g, " ")} · {run.request.attributes.join(", ").replace(/_/g, " ")} · started by {run.createdBy.name} ({run.createdBy.role}) ·{" "}
            {fmtDate(run.createdAt)}
          </p>
          {run.datasetHash && <p className="mt-1 font-mono text-[11px] text-muted">dataset {run.datasetHash.slice(0, 16)}…</p>}
          {demoNote && <p className="mt-2 text-xs text-amber-900">{demoNote}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {onResume && canContinue && (
            <button className="btn btn-primary" onClick={onResume}>
              Continue workflow
            </button>
          )}
          {onCancel && !terminal && (
            <button className="btn btn-secondary text-critical" onClick={onCancel} disabled={busy}>
              Cancel audit
            </button>
          )}
          <button className="btn btn-secondary" onClick={exportHistory}>
            Export history
          </button>
        </div>
      </div>

      {run.failure && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">▲ {run.failure}</div>}

      <section className="card">
        <h3 className="text-sm font-semibold">Workflow graph</h3>
        <p className="mb-3 text-xs text-ink-2">Every node is a persisted task record. Select one to inspect it.</p>
        <WorkflowGraph run={run} selected={taskId} onSelect={setTaskId} />
        {task && (
          <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">
                {AGENTS[task.agent].name} · {task.operation}
              </div>
              <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setTaskId(null)}>
                Close
              </button>
            </div>
            <dl className="tabular mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <dt className="text-muted">Status</dt>
              <dd>{task.status}</dd>
              <dt className="text-muted">Attempts</dt>
              <dd>
                {task.attempts} / {task.retryLimit + 1}
              </dd>
              <dt className="text-muted">Agent version</dt>
              <dd>
                {task.result?.agentVersion ?? AGENTS[task.agent].version} ({AGENTS[task.agent].kind})
              </dd>
              <dt className="text-muted">Duration</dt>
              <dd>{task.result ? `${task.result.durationMs} ms` : "—"}</dd>
              <dt className="text-muted">Depends on</dt>
              <dd className="col-span-3">{task.dependsOn.map((d) => d.split(":").slice(1).join(":")).join(", ") || "—"}</dd>
              <dt className="text-muted">Evidence</dt>
              <dd className="col-span-3 font-mono">{task.result?.evidenceRefs.join(", ") || "—"}</dd>
              <dt className="text-muted">Tool calls</dt>
              <dd>{task.result?.usage.toolCalls ?? 0}</dd>
              <dt className="text-muted">Model calls</dt>
              <dd>{task.result?.usage.modelCalls ?? 0}</dd>
            </dl>
            {task.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-critical">
                {task.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            {task.result?.limitations.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-ink-2">
                {task.result.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : null}
            {task.result && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-brand">Validated output (JSON)</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-sunken p-2 text-[11px]">{JSON.stringify(task.result.findings, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </section>

      {pending && (
        <section className="card border-amber-300" aria-labelledby={`gate-${run.id}`}>
          <h3 id={`gate-${run.id}`} className="text-sm font-semibold">
            Human review gate
          </h3>
          <p className="mt-1 text-sm">{pending.action}</p>
          <p className="mt-1 text-xs text-ink-2">
            {verdicts.filter((v) => v.verdict === "verified").length} verified · {verdicts.filter((v) => v.verdict === "descriptive_only").length} descriptive only ·{" "}
            {verdicts.filter((v) => v.verdict === "rejected").length} rejected · {run.conflicts.length} conflict(s). Agents cannot approve; the person who started the audit cannot
            approve it either.
          </p>
          {onDecide && (
            <>
              <label className="label mt-3" htmlFor={`rat-${run.id}`}>
                Rationale
              </label>
              <textarea id={`rat-${run.id}`} className="input min-h-[64px]" value={rationale} maxLength={1000} onChange={(e) => setRationale(e.target.value)} placeholder="What did you check before releasing (or rejecting) these findings?" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="btn btn-primary" onClick={() => decide("approved")} disabled={busy}>
                  Approve &amp; generate report
                </button>
                <button className="btn btn-secondary" onClick={() => decide("rejected")} disabled={busy}>
                  Reject
                </button>
                {error && <span className="text-sm text-critical">{error}</span>}
              </div>
            </>
          )}
        </section>
      )}

      {run.conflicts.length > 0 && (
        <section className="card">
          <h3 className="text-sm font-semibold">Agent conflicts ({run.conflicts.length})</h3>
          <p className="text-xs text-ink-2">Shown, not hidden. Precedence: verified statistics, then hard policy, then human review — over any generated narrative.</p>
          <ul className="mt-3 space-y-3">
            {run.conflicts.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="font-medium">{c.topic}</div>
                <ul className="mt-1 space-y-1 text-xs text-ink-2">
                  {c.positions.map((p) => (
                    <li key={p.agent}>
                      <strong className="text-ink">{AGENTS[p.agent].name}:</strong> {p.position}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-xs">
                  <Badge color="brand">{c.precedence.replace(/_/g, " ")}</Badge> {c.resolution}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sections.length > 0 && (
        <section className="card">
          <h3 className="text-sm font-semibold">Findings and explanations</h3>
          <ul className="mt-3 space-y-2">
            {sections.map((s, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">{CATEGORY_LABEL[s.category] ?? s.category}</div>
                <p className="mt-0.5">{s.text}</p>
                {s.evidenceRefs.length > 0 && <div className="mt-1 font-mono text-[10px] text-muted">{s.evidenceRefs.join(" · ")}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h3 className="text-sm font-semibold">Usage</h3>
          <dl className="tabular mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">Tasks run</dt>
            <dd>{run.usage.tasksRun}</dd>
            <dt className="text-muted">Tool calls</dt>
            <dd>{run.usage.toolCalls}</dd>
            <dt className="text-muted">Model calls</dt>
            <dd>{run.usage.modelCalls}</dd>
            <dt className="text-muted">Estimated model cost</dt>
            <dd>${run.usage.estimatedCostUsd.toFixed(2)}</dd>
            <dt className="text-muted">Agent execution time</dt>
            <dd>{run.usage.durationMs.toFixed(0)} ms</dd>
          </dl>
          <p className="mt-2 text-xs text-muted">All agents in this release are deterministic services; none calls a language model.</p>
        </section>
        <section className="card">
          <h3 className="text-sm font-semibold">State history ({run.transitions.length})</h3>
          <ol className="mt-2 max-h-56 space-y-1 overflow-auto border-l border-line pl-3 text-xs">
            {run.transitions.map((t, i) => (
              <li key={i}>
                <span className="font-mono">
                  {t.from} → {t.to}
                </span>{" "}
                · {t.actor} · <span className="text-ink-2">{t.reason}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
