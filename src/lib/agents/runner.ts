"use client";

import { useCallback, useRef } from "react";
import { primaryAudit } from "./agents";
import type { Actor, AuditRequest, WorkflowRun } from "./contracts";
import { advance, createWorkflow, decide, requestCancel } from "./orchestrator";
import type { OrgPolicy } from "./policy";
import { newId, useStore, type AuditRun, type Finding, type State } from "../store";

export function policyFrom(state: State): OrgPolicy {
  return { organisationId: state.organisation.id, ...state.settings, retentionDays: 90 };
}

export function actorFrom(user: { name: string; role: string }): Actor {
  return { kind: "human", id: `user:${user.name}`, name: user.name, role: user.role };
}

/**
 * Runs workflows in the browser against the current workspace and persists
 * every change. Execution is deterministic and bounded (a fixed plan of at
 * most 16 tasks), so it never needs an unbounded serverless worker.
 */
export function useWorkflowRunner() {
  const { state, update, log, user } = useStore();
  const stateRef = useRef(state);
  stateRef.current = state;

  const save = useCallback(
    (run: WorkflowRun) => update((s) => ({ ...s, workflows: s.workflows.some((w) => w.id === run.id) ? s.workflows.map((w) => (w.id === run.id ? run : w)) : [...s.workflows, run] })),
    [update],
  );

  /** On completion, publish the primary audit into the Audit Lab exactly once. */
  const linkToAuditLab = useCallback(
    (run: WorkflowRun) => {
      if (run.state !== "COMPLETED" || run.linkedAuditId) return run;
      const result = primaryAudit(run);
      if (!result) return run;
      const auditId = newId("aud");
      const now = new Date().toISOString();
      const s = stateRef.current;
      const audit: AuditRun = {
        id: auditId,
        createdAt: now,
        createdBy: `${run.createdBy.name} via multi-agent workflow`,
        jobTitle: s.records.find((r) => r.jobRef === run.request.jobRef)?.jobTitle ?? run.request.jobRef,
        datasetHash: run.datasetHash ?? "",
        importIds: [...new Set(s.records.filter((r) => r.jobRef === run.request.jobRef && r.stage === run.request.stage).map((r) => r.importId ?? "unknown"))],
        result,
      };
      const findings: Finding[] = result.findings.map((f) => ({ ...f, id: newId("fnd"), auditId, status: "open", createdAt: now }));
      const linked = { ...run, linkedAuditId: auditId };
      update((st) => ({ ...st, audits: [...st.audits, audit], findings: [...st.findings, ...findings], workflows: st.workflows.map((w) => (w.id === run.id ? linked : w)) }));
      log("workflow.linked_to_audit_lab", `workflow:${run.id}`, `audit ${auditId}`);
      return linked;
    },
    [update, log],
  );

  const drive = useCallback(
    async (run: WorkflowRun, stepThrough: boolean) => {
      const succeeded = (r: WorkflowRun) => r.tasks.filter((t) => t.status === "succeeded").length;
      const before = succeeded(run);
      let latest = before;
      const out = await advance(run, {
        records: stateRef.current.records,
        policy: policyFrom(stateRef.current),
        persist: (r) => {
          latest = succeeded(r);
          save(r);
        },
        // Step-through mode stops after each newly completed task so a person can inspect it.
        shouldStop: () => stepThrough && latest > before,
      });
      save(out);
      log(`workflow.${out.state.toLowerCase()}`, `workflow:${out.id}`, out.failure ?? `${out.usage.tasksRun} tasks run`);
      return linkToAuditLab(out);
    },
    [save, log, linkToAuditLab],
  );

  const start = useCallback(
    async (request: AuditRequest, stepThrough: boolean) => {
      const run = createWorkflow({ id: newId("wf"), organisationId: stateRef.current.organisation.id, request, createdBy: actorFrom(user) });
      save(run);
      log("workflow.created", `workflow:${run.id}`, `${request.jobRef}/${request.stage}; ${request.attributes.join(", ")}`);
      return drive(run, stepThrough);
    },
    [user, save, log, drive],
  );

  const resume = useCallback(
    (run: WorkflowRun, stepThrough: boolean) => drive({ ...run, paused: false }, stepThrough),
    [drive],
  );

  const approve = useCallback(
    async (run: WorkflowRun, decision: "approved" | "rejected", rationale: string) => {
      const decided = decide(run, run.approvals.find((a) => a.status === "pending")!.id, actorFrom(user), decision, rationale);
      save(decided);
      log(`workflow.gate_${decision}`, `workflow:${run.id}`, rationale.slice(0, 80));
      return decision === "approved" ? drive(decided, false) : decided;
    },
    [user, save, log, drive],
  );

  const cancel = useCallback(
    (run: WorkflowRun) => {
      const c = requestCancel(run, actorFrom(user));
      save(c);
      log("workflow.cancel_requested", `workflow:${run.id}`);
      return c;
    },
    [user, save, log],
  );

  return { start, resume, approve, cancel };
}
