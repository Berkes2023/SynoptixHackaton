"use client";

import { useCallback, useRef } from "react";
import type { Actor, AuditRequest, WorkflowRun } from "./contracts";
import { linkRunIntoWorkspace } from "./link";
import { advance, createWorkflow, decide, requestCancel } from "./orchestrator";
import type { OrgPolicy } from "./policy";
import { newId, useStore, type State } from "../store";

export function policyFrom(state: State): OrgPolicy {
  return { organisationId: state.organisation.id, ...state.settings, retentionDays: 90 };
}

export function actorFrom(user: { name: string; role: string }): Actor {
  return { kind: "human", id: `user:${user.name}`, name: user.name, role: user.role };
}

async function callApi(path: string, body: unknown): Promise<WorkflowRun> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as { run?: WorkflowRun; error?: string };
  if (!res.ok || !out.run) throw new Error(out.error ?? "The server could not run this step.");
  return out.run;
}

export function useWorkflowRunner() {
  const { mode } = useStore();
  const local = useLocalRunner();
  const cloud = useCloudRunner();
  return mode === "cloud" ? cloud : local;
}

/**
 * Signed in: workflows run on the server with the caller's identity from the
 * session, and are stored in the organisation's workflows table.
 */
function useCloudRunner() {
  const { update, pull } = useStore();
  const settle = useCallback(
    async (run: WorkflowRun) => {
      update((s) => ({ ...s, workflows: s.workflows.some((w) => w.id === run.id) ? s.workflows.map((w) => (w.id === run.id ? run : w)) : [...s.workflows, run] }));
      // Picks up the audit-log entries and, on completion, the audit linked into the Audit Lab.
      await pull();
      return run;
    },
    [update, pull],
  );
  return {
    start: useCallback(async (request: AuditRequest, stepThrough: boolean) => settle(await callApi("/api/v1/workflows", { request, stepThrough })), [settle]),
    resume: useCallback(async (run: WorkflowRun, stepThrough: boolean) => settle(await callApi(`/api/v1/workflows/${encodeURIComponent(run.id)}`, { action: "advance", stepThrough })), [settle]),
    approve: useCallback(
      async (run: WorkflowRun, decision: "approved" | "rejected", rationale: string) => settle(await callApi(`/api/v1/workflows/${encodeURIComponent(run.id)}`, { action: "decide", decision, rationale })),
      [settle],
    ),
    cancel: useCallback(async (run: WorkflowRun) => settle(await callApi(`/api/v1/workflows/${encodeURIComponent(run.id)}`, { action: "cancel" })), [settle]),
  };
}

/**
 * Browser demo: runs workflows against the local workspace and persists
 * every change. Execution is deterministic and bounded (a fixed plan of at
 * most 16 tasks), so it never needs an unbounded serverless worker.
 */
function useLocalRunner() {
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
      const out = linkRunIntoWorkspace(stateRef.current, run, newId);
      if (!out) return run;
      const { audits, findings } = out.ws;
      update((st) => ({ ...st, audits, findings, workflows: st.workflows.map((w) => (w.id === run.id ? out.run : w)) }));
      log("workflow.linked_to_audit_lab", `workflow:${run.id}`, `audit ${out.run.linkedAuditId}`);
      return out.run;
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
