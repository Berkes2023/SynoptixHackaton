import type { z } from "zod";
import { canonicalDataset, sha256Hex } from "../hash";
import type { ScreeningRecord } from "../fairness/types";
import { AGENTS, type AgentDefinition } from "./agents";
import {
  ALLOWED_TRANSITIONS,
  AgentResultSchema,
  AgentTaskSchema,
  AuditRequestSchema,
  FINDING_SCHEMAS,
  SCHEMA_VERSION,
  TERMINAL_STATES,
  WorkflowRunSchema,
  type Actor,
  type AgentTask,
  type AgentType,
  type Approval,
  type AuditRequest,
  type Conflict,
  type DiscoverySchema,
  type MitigationSchema,
  type TaskRecord,
  type VerificationSchema,
  type WorkflowRun,
  type WorkflowState,
} from "./contracts";
import { assertCanApprove, DataBroker, PolicyViolation, type OrgPolicy } from "./policy";

export const ORCHESTRATOR_VERSION = "1.0.0";
const ORCHESTRATOR: Actor = { kind: "system", id: "orchestrator", name: "Orchestrator", role: "system" };

export class TransitionError extends Error {}
class Cancelled extends Error {}
class TimeoutError extends Error {}

export interface OrchestratorContext {
  records: ScreeningRecord[];
  policy: OrgPolicy;
  /** Called after every persisted change (state transition, task update, approval). */
  persist: (run: WorkflowRun) => void | Promise<void>;
  now?: () => Date;
  /** Override agents (tests use this to inject failures, delays or bad output). */
  agents?: Partial<Record<AgentType, AgentDefinition>>;
  /** Checked between tasks; returning true stops after the current task (pause / simulated crash). */
  shouldStop?: () => boolean;
}

const iso = (ctx: OrchestratorContext) => (ctx.now?.() ?? new Date()).toISOString();
const clone = (run: WorkflowRun): WorkflowRun => structuredClone(run);

export function createWorkflow(input: { id: string; organisationId: string; request: AuditRequest; createdBy: Actor; now?: Date; maxTasks?: number }): WorkflowRun {
  const request = AuditRequestSchema.parse(input.request);
  const at = (input.now ?? new Date()).toISOString();
  return WorkflowRunSchema.parse({
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    organisationId: input.organisationId,
    createdBy: input.createdBy,
    createdAt: at,
    updatedAt: at,
    request,
    state: "CREATED",
    paused: false,
    cancelRequested: false,
    transitions: [],
    tasks: [],
    approvals: [],
    conflicts: [],
    evidence: {},
    usage: { toolCalls: 0, modelCalls: 0, modelTokens: 0, estimatedCostUsd: 0, tasksRun: 0, durationMs: 0 },
    limits: { maxTasks: input.maxTasks ?? 16, defaultRetryLimit: 2, taskTimeoutMs: 10_000 },
    failure: null,
    datasetHash: null,
    linkedAuditId: null,
  });
}

/** Validated, logged state change. Illegal transitions throw. */
export function transition(run: WorkflowRun, to: WorkflowState, reason: string, actor: Actor, at: string) {
  if (!ALLOWED_TRANSITIONS[run.state].includes(to)) throw new TransitionError(`Illegal transition ${run.state} → ${to}.`);
  run.transitions.push({ from: run.state, to, at, reason, actor: `${actor.name} (${actor.kind})` });
  run.state = to;
  run.updatedAt = at;
}

/** Adds a task once. Duplicate (agent, operation) pairs and runaway task chains are refused. */
export function addTask(run: WorkflowRun, spec: Pick<AgentTask, "agent" | "operation" | "dependsOn" | "phase" | "required">): TaskRecord {
  const taskId = `${run.id}:${spec.agent}:${spec.operation}`;
  const existing = run.tasks.find((t) => t.taskId === taskId);
  if (existing) return existing; // idempotent
  if (run.tasks.length >= run.limits.maxTasks) throw new PolicyViolation(`Task limit (${run.limits.maxTasks}) reached; refusing to create more tasks.`);
  for (const d of spec.dependsOn) if (!run.tasks.some((t) => t.taskId === d)) throw new PolicyViolation(`Unknown dependency ${d}.`);
  const task = AgentTaskSchema.parse({
    taskId,
    auditRunId: run.id,
    organisationId: run.organisationId,
    agent: spec.agent,
    operation: spec.operation,
    dataRefs: [`dataset:${run.request.jobRef}/${run.request.stage}`],
    dependsOn: spec.dependsOn,
    phase: spec.phase,
    inputSchemaVersion: SCHEMA_VERSION,
    maxDurationMs: run.limits.taskTimeoutMs,
    retryLimit: run.limits.defaultRetryLimit,
    required: spec.required,
  });
  const rec: TaskRecord = { ...task, status: "pending", attempts: 0, startedAt: null, finishedAt: null, result: null, errors: [] };
  run.tasks.push(rec);
  return rec;
}

const tid = (run: WorkflowRun, agent: AgentType, op: string) => `${run.id}:${agent}:${op}`;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms} ms.`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function runTask(run: WorkflowRun, taskId: string, ctx: OrchestratorContext): Promise<void> {
  const task = run.tasks.find((t) => t.taskId === taskId)!;
  if (task.status === "succeeded" || task.status === "skipped") return; // idempotent re-execution
  for (const d of task.dependsOn) {
    const dep = run.tasks.find((t) => t.taskId === d)!;
    if (dep.status !== "succeeded" && dep.status !== "skipped") throw new PolicyViolation(`Dependency ${dep.agent}:${dep.operation} has not completed.`);
  }
  const agent = ctx.agents?.[task.agent] ?? AGENTS[task.agent];
  const broker = new DataBroker(run.organisationId, ctx.records, () => run.evidence);

  while (task.attempts <= task.retryLimit) {
    if (run.cancelRequested) throw new Cancelled();
    task.attempts++;
    task.status = "running";
    task.startedAt = iso(ctx);
    await ctx.persist(clone(run));
    const started = performance.now();
    try {
      const out = await withTimeout(agent.execute({ task, run, broker, policy: ctx.policy }), task.maxDurationMs);
      const findings = (FINDING_SCHEMAS[task.agent] as z.ZodTypeAny).parse(out.findings);
      const usage = { toolCalls: out.usage?.toolCalls ?? 0, modelCalls: out.usage?.modelCalls ?? 0, modelTokens: out.usage?.modelTokens ?? 0, estimatedCostUsd: out.usage?.estimatedCostUsd ?? 0 };
      for (const k of Object.keys(out.evidence ?? {})) if (!k.startsWith("ev:")) throw new Error(`Evidence key "${k}" must start with "ev:".`);
      task.result = AgentResultSchema.parse({
        taskId: task.taskId,
        agent: task.agent,
        agentVersion: agent.version,
        status: "succeeded",
        evidenceRefs: Object.keys(out.evidence ?? {}),
        findings,
        limitations: out.limitations,
        error: null,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        usage,
      });
      Object.assign(run.evidence, out.evidence ?? {});
      run.usage.toolCalls += usage.toolCalls;
      run.usage.modelCalls += usage.modelCalls;
      run.usage.modelTokens += usage.modelTokens;
      run.usage.estimatedCostUsd += usage.estimatedCostUsd;
      run.usage.tasksRun++;
      run.usage.durationMs += task.result.durationMs;
      task.status = "succeeded";
      task.finishedAt = iso(ctx);
      await ctx.persist(clone(run));
      return;
    } catch (e) {
      if (e instanceof PolicyViolation) {
        // Policy denials are never retried.
        task.errors.push(`Policy: ${e.message}`);
        task.status = "failed";
        task.finishedAt = iso(ctx);
        throw e;
      }
      const msg = e instanceof Error ? `${e.name === "ZodError" ? "Output failed validation" : e.name}: ${e.message.slice(0, 300)}` : String(e);
      task.errors.push(`Attempt ${task.attempts}: ${msg}`);
      task.status = "failed";
      task.finishedAt = iso(ctx);
      await ctx.persist(clone(run));
    }
  }
  if (!task.required) {
    task.status = "skipped";
    await ctx.persist(clone(run));
    return;
  }
  throw new Error(`${agent.name} failed after ${task.attempts} attempt(s).`);
}

function detectConflicts(run: WorkflowRun): Conflict[] {
  const conflicts: Conflict[] = [];
  const disc = run.evidence["ev:discovery"] as z.infer<typeof DiscoverySchema> | undefined;
  const ver = run.evidence["ev:verification"] as z.infer<typeof VerificationSchema> | undefined;
  for (const v of ver?.verdicts ?? []) {
    const h = disc?.hypotheses.find((x) => x.id === v.hypothesisId);
    if (!h || v.verdict === "verified" || h.priority === "low") continue;
    conflicts.push({
      id: `C-${v.hypothesisId}`,
      agents: ["bias_discovery", "statistical_verification"],
      topic: `${h.group} vs ${h.reference} (${h.attribute})`,
      positions: [
        { agent: "bias_discovery", position: `Proposed as ${h.priority}-priority disparity: ${h.rationale}` },
        { agent: "statistical_verification", position: `${v.verdict === "rejected" ? "Rejected" : "Descriptive only"}: ${v.reasons.join(" ")}` },
      ],
      resolution: "Verified statistics take precedence. Reported as an observation for human review, not as a verified finding.",
      precedence: "verified_statistics",
    });
  }
  const mit = run.evidence["ev:mitigation"] as z.infer<typeof MitigationSchema> | undefined;
  for (const t of mit?.trials ?? []) {
    if (!t.touchesJobRelevantField) continue;
    conflicts.push({
      id: `C-mitigation-${t.cue}`,
      agents: ["mitigation", "governance"],
      topic: `Masking ${t.maskedFields.join(", ")}`,
      positions: [
        { agent: "mitigation", position: `Masking reduced mock-engine sensitivity from ${t.beforeMeanDelta.toFixed(2)} to ${t.afterMeanDelta.toFixed(2)}.` },
        { agent: "governance", position: "The field is treated as job-relevant by policy and must be retained." },
      ],
      resolution: "Policy constraint takes precedence: the field is retained. An alternative rubric is recorded as a recommendation for human review.",
      precedence: "policy_constraint",
    });
  }
  return conflicts;
}

/**
 * Advances a workflow until it reaches a human review gate, finishes, fails,
 * is cancelled, or is asked to stop. Safe to call again on a persisted run:
 * completed tasks are skipped, so execution is idempotent and resumable.
 */
export async function advance(input: WorkflowRun, ctx: OrchestratorContext): Promise<WorkflowRun> {
  const run = clone(input);
  const at = () => iso(ctx);
  const step = async (to: WorkflowState, reason: string) => {
    transition(run, to, reason, ORCHESTRATOR, at());
    await ctx.persist(clone(run));
  };
  const stop = () => run.paused || ctx.shouldStop?.() === true;

  try {
    if (TERMINAL_STATES.includes(run.state) || run.state === "AWAITING_REVIEW") return run;
    if (run.cancelRequested) throw new Cancelled();

    if (run.state === "CREATED") {
      run.datasetHash = await sha256Hex(canonicalDataset(ctx.records.filter((r) => r.jobRef === run.request.jobRef && r.stage === run.request.stage)));
      addTask(run, { agent: "governance", operation: "preflight", dependsOn: [], phase: "VALIDATING", required: true });
      addTask(run, { agent: "data_integrity", operation: "assess", dependsOn: [tid(run, "governance", "preflight")], phase: "VALIDATING", required: true });
      await step("VALIDATING", "Request accepted; running policy preflight and data validation.");
    }
    if (run.state === "VALIDATING") {
      await runTask(run, tid(run, "governance", "preflight"), ctx);
      const decision = run.tasks.find((t) => t.taskId === tid(run, "governance", "preflight"))!.result!.findings as { allowed: boolean; denials: string[] };
      if (!decision.allowed) throw new PolicyViolation(decision.denials.join(" "));
      if (stop()) return run;
      await runTask(run, tid(run, "data_integrity", "assess"), ctx);
      const dq = run.evidence["ev:data_quality"] as { usable: boolean };
      if (!dq.usable) throw new Error("Data Integrity: the dataset is not reliable enough for this audit (see checks).");
      if (stop()) return run;
      await step("PLANNING", "Data validated.");
    }
    if (run.state === "PLANNING") {
      const di = tid(run, "data_integrity", "assess");
      addTask(run, { agent: "bias_discovery", operation: "scan", dependsOn: [di], phase: "ANALYSING", required: true });
      const verifyDeps = [tid(run, "bias_discovery", "scan")];
      if (run.request.runExperiments) {
        addTask(run, { agent: "counterfactual", operation: "run", dependsOn: [tid(run, "governance", "preflight")], phase: "EXPERIMENTING", required: false });
        if (run.request.runMitigation) addTask(run, { agent: "mitigation", operation: "test", dependsOn: [tid(run, "counterfactual", "run")], phase: "EXPERIMENTING", required: false });
      }
      addTask(run, { agent: "statistical_verification", operation: "verify", dependsOn: verifyDeps, phase: "VERIFYING", required: true });
      if (run.request.runExperiments && run.request.runMitigation)
        addTask(run, { agent: "governance", operation: "review_mitigation", dependsOn: [tid(run, "mitigation", "test")], phase: "VERIFYING", required: false });
      addTask(run, { agent: "explainability", operation: "explain", dependsOn: [tid(run, "statistical_verification", "verify")], phase: "VERIFYING", required: true });
      addTask(run, { agent: "reporting", operation: "assemble", dependsOn: [tid(run, "explainability", "explain")], phase: "REPORTING", required: true });
      await step("ANALYSING", `Plan created with ${run.tasks.length} tasks.`);
    }
    if (run.state === "ANALYSING") {
      await runTask(run, tid(run, "bias_discovery", "scan"), ctx);
      if (stop()) return run;
      await step(run.request.runExperiments ? "EXPERIMENTING" : "VERIFYING", "Discovery complete.");
    }
    if (run.state === "EXPERIMENTING") {
      await runTask(run, tid(run, "counterfactual", "run"), ctx);
      if (stop()) return run;
      if (run.request.runMitigation) {
        await runTask(run, tid(run, "mitigation", "test"), ctx);
        if (stop()) return run;
      }
      await step("VERIFYING", "Experiments complete.");
    }
    if (run.state === "VERIFYING") {
      await runTask(run, tid(run, "statistical_verification", "verify"), ctx);
      if (stop()) return run;
      if (run.tasks.some((t) => t.taskId === tid(run, "governance", "review_mitigation"))) {
        await runTask(run, tid(run, "governance", "review_mitigation"), ctx);
        if (stop()) return run;
      }
      run.conflicts = detectConflicts(run);
      await runTask(run, tid(run, "explainability", "explain"), ctx);
      if (stop()) return run;
      const gate: Approval = {
        id: `${run.id}:release_findings`,
        gate: "release_findings",
        action: "Release verified findings into the Audit Lab and generate the internal evidence report.",
        requestedBy: ORCHESTRATOR,
        requestedAt: at(),
        evidenceRefs: ["ev:verification", "ev:explanation"],
        status: "pending",
        reviewer: null,
        decidedAt: null,
        rationale: null,
      };
      if (!run.approvals.some((a) => a.id === gate.id)) run.approvals.push(gate);
      await step("AWAITING_REVIEW", "Verification complete; human approval required before reporting.");
      return run;
    }
    if (run.state === "REPORTING") {
      await runTask(run, tid(run, "reporting", "assemble"), ctx);
      await step("COMPLETED", "Evidence package assembled.");
    }
    return run;
  } catch (e) {
    if (e instanceof Cancelled) {
      if (!TERMINAL_STATES.includes(run.state)) {
        for (const t of run.tasks) if (t.status === "pending" || t.status === "running") t.status = "cancelled";
        transition(run, "CANCELLED", "Cancelled by a user.", ORCHESTRATOR, at());
        await ctx.persist(clone(run));
      }
      return run;
    }
    run.failure = e instanceof Error ? e.message : String(e);
    if (!TERMINAL_STATES.includes(run.state) && ALLOWED_TRANSITIONS[run.state].includes("FAILED")) transition(run, "FAILED", run.failure, ORCHESTRATOR, at());
    await ctx.persist(clone(run));
    return run;
  }
}

/** Human decision at a review gate. Agents (and the initiator) cannot approve. */
export function decide(input: WorkflowRun, approvalId: string, reviewer: Actor, decision: "approved" | "rejected", rationale: string, now = new Date()): WorkflowRun {
  const run = clone(input);
  const approval = run.approvals.find((a) => a.id === approvalId);
  if (!approval) throw new PolicyViolation("Unknown approval request.");
  if (approval.status !== "pending") throw new PolicyViolation("This request has already been decided.");
  assertCanApprove(reviewer, run.createdBy);
  if (rationale.trim().length < 10) throw new PolicyViolation("A rationale of at least 10 characters is required.");
  approval.status = decision;
  approval.reviewer = reviewer;
  approval.decidedAt = now.toISOString();
  approval.rationale = rationale.trim();
  if (run.state === "AWAITING_REVIEW") {
    if (decision === "approved") transition(run, "REPORTING", `Approved by ${reviewer.name}: ${rationale.trim()}`, reviewer, approval.decidedAt);
    else transition(run, "CANCELLED", `Rejected by ${reviewer.name}: ${rationale.trim()}`, reviewer, approval.decidedAt);
  }
  return run;
}

export function requestCancel(input: WorkflowRun, by: Actor, now = new Date()): WorkflowRun {
  const run = clone(input);
  if (TERMINAL_STATES.includes(run.state)) return run;
  run.cancelRequested = true;
  if (run.state === "AWAITING_REVIEW" || run.state === "CREATED") {
    for (const t of run.tasks) if (t.status === "pending") t.status = "cancelled";
    transition(run, "CANCELLED", `Cancelled by ${by.name}.`, by, now.toISOString());
  }
  return run;
}
