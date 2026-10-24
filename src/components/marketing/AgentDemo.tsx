"use client";

import { useState } from "react";
import { WorkflowDetail } from "@/components/agents/WorkflowDetail";
import type { Actor, WorkflowRun } from "@/lib/agents/contracts";
import { advance, createWorkflow, decide } from "@/lib/agents/orchestrator";
import { demoRecords } from "@/lib/site/demo-data";

const INITIATOR: Actor = { kind: "human", id: "demo-auditor", name: "Sam Patel (fictional auditor)", role: "Auditor" };
const VISITOR: Actor = { kind: "human", id: "demo-visitor", name: "You, as a fictional reviewer", role: "Reviewer" };
const POLICY = { organisationId: "org_demo", authorisedAttributes: ["gender", "age_band", "nationality"], minimumGroupSize: 20, confidenceLevel: 0.95, impactThreshold: 0.8, alpha: 0.05, retentionDays: 90 };

/**
 * Public demo: runs the real orchestrator and agents in the browser on the
 * fictional dataset. Nothing is stored; every state shown is a genuine transition.
 */
export function AgentDemo() {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [busy, setBusy] = useState(false);
  const records = demoRecords().map((r) => ({ ...r, importId: "imp_public_demo" }));
  const ctx = { records, policy: POLICY, persist: (r: WorkflowRun) => setRun(r) };

  async function start() {
    setBusy(true);
    const created = createWorkflow({
      id: `wf_demo_${Date.now().toString(36)}`,
      organisationId: "org_demo",
      createdBy: INITIATOR,
      request: {
        objective: "Examine Software Engineer initial screening for gender and age-band disparities, test cue sensitivity and verify evidence.",
        jobRef: "REQ-1042",
        stage: "initial_screening",
        attributes: ["gender", "age_band"],
        runExperiments: true,
        runMitigation: true,
        externalAts: false,
        externalModelProvider: false,
      },
    });
    setRun(await advance(created, ctx));
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {!run ? (
        <div className="card flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-2">
            Runs the real orchestrator and all eight agents in your browser on fictional data, then stops at the human review gate for you to decide.
          </p>
          <button className="btn btn-primary btn-lg" onClick={start} disabled={busy}>
            {busy ? "Running…" : "Launch multi-agent demo"}
          </button>
        </div>
      ) : (
        <WorkflowDetail
          run={run}
          busy={busy}
          demoNote="Synthetic simulation with genuine workflow state transitions. Nothing is stored or sent anywhere."
          onDecide={async (d, rationale) => {
            try {
              setBusy(true);
              const decided = decide(run, run.approvals.find((a) => a.status === "pending")!.id, VISITOR, d, rationale);
              setRun(d === "approved" ? await advance(decided, ctx) : decided);
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : "Decision failed.";
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {run && (
        <button className="btn btn-ghost text-sm" onClick={() => setRun(null)}>
          Reset demo
        </button>
      )}
    </div>
  );
}
