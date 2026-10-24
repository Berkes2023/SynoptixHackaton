import { z } from "zod";

/**
 * Typed contracts for DeepTrace's bounded multi-agent audit workflow.
 * Every agent output is parsed with these schemas before the orchestrator
 * accepts it; free-form text is never executed as an instruction.
 */
export const SCHEMA_VERSION = "dt-agents-1.0";

export const AGENT_TYPES = [
  "governance",
  "data_integrity",
  "bias_discovery",
  "counterfactual",
  "statistical_verification",
  "mitigation",
  "explainability",
  "reporting",
] as const;
export const AgentTypeSchema = z.enum(AGENT_TYPES);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export const WORKFLOW_STATES = [
  "CREATED",
  "VALIDATING",
  "PLANNING",
  "ANALYSING",
  "EXPERIMENTING",
  "VERIFYING",
  "AWAITING_REVIEW",
  "REPORTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const WorkflowStateSchema = z.enum(WORKFLOW_STATES);
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const TERMINAL_STATES: readonly WorkflowState[] = ["COMPLETED", "FAILED", "CANCELLED"];

/** The only legal state transitions. Anything else is rejected and logged. */
export const ALLOWED_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  CREATED: ["VALIDATING", "FAILED", "CANCELLED"],
  VALIDATING: ["PLANNING", "FAILED", "CANCELLED"],
  PLANNING: ["ANALYSING", "FAILED", "CANCELLED"],
  ANALYSING: ["EXPERIMENTING", "VERIFYING", "FAILED", "CANCELLED"],
  EXPERIMENTING: ["VERIFYING", "FAILED", "CANCELLED"],
  VERIFYING: ["AWAITING_REVIEW", "FAILED", "CANCELLED"],
  AWAITING_REVIEW: ["REPORTING", "CANCELLED"],
  REPORTING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export const ActorSchema = z.object({
  kind: z.enum(["human", "agent", "system"]),
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
});
export type Actor = z.infer<typeof ActorSchema>;

export const AuditRequestSchema = z.object({
  objective: z.string().min(10).max(500),
  jobRef: z.string().min(1),
  stage: z.string().min(1),
  attributes: z.array(z.string().min(1)).min(1).max(5),
  runExperiments: z.boolean(),
  runMitigation: z.boolean(),
  /** Always false in this deployment; requesting them is denied by policy. */
  externalAts: z.boolean().default(false),
  externalModelProvider: z.boolean().default(false),
});
export type AuditRequest = z.infer<typeof AuditRequestSchema>;

export const TaskStatusSchema = z.enum(["pending", "running", "succeeded", "failed", "skipped", "cancelled"]);

export const AgentTaskSchema = z.object({
  taskId: z.string().min(1),
  auditRunId: z.string().min(1),
  organisationId: z.string().min(1),
  agent: AgentTypeSchema,
  operation: z.string().min(1),
  /** Opaque references; agents resolve them through the data broker, never raw records. */
  dataRefs: z.array(z.string()),
  dependsOn: z.array(z.string()),
  phase: WorkflowStateSchema,
  inputSchemaVersion: z.literal(SCHEMA_VERSION),
  maxDurationMs: z.number().int().positive().max(60_000),
  retryLimit: z.number().int().min(0).max(3),
  required: z.boolean(),
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

export const UsageSchema = z.object({
  toolCalls: z.number().int().min(0),
  modelCalls: z.number().int().min(0),
  modelTokens: z.number().int().min(0),
  estimatedCostUsd: z.number().min(0),
});
export type Usage = z.infer<typeof UsageSchema>;

/** Envelope every agent returns. `findings` is validated again by the agent's own schema. */
export const AgentResultSchema = z.object({
  taskId: z.string().min(1),
  agent: AgentTypeSchema,
  agentVersion: z.string().min(1),
  status: z.enum(["succeeded", "failed"]),
  evidenceRefs: z.array(z.string()),
  findings: z.unknown(),
  limitations: z.array(z.string()),
  error: z.string().nullable(),
  durationMs: z.number().min(0),
  usage: UsageSchema,
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

export const TaskRecordSchema = AgentTaskSchema.extend({
  status: TaskStatusSchema,
  attempts: z.number().int().min(0),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  result: AgentResultSchema.nullable(),
  errors: z.array(z.string()),
});
export type TaskRecord = z.infer<typeof TaskRecordSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  gate: z.enum(["release_findings", "external_ats_testing", "external_model_provider", "external_report_distribution", "apply_mitigation"]),
  action: z.string(),
  requestedBy: ActorSchema,
  requestedAt: z.string(),
  evidenceRefs: z.array(z.string()),
  status: z.enum(["pending", "approved", "rejected"]),
  reviewer: ActorSchema.nullable(),
  decidedAt: z.string().nullable(),
  rationale: z.string().nullable(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ConflictSchema = z.object({
  id: z.string(),
  agents: z.array(AgentTypeSchema).min(2),
  topic: z.string(),
  positions: z.array(z.object({ agent: AgentTypeSchema, position: z.string() })),
  resolution: z.string(),
  /** Which kind of evidence won, per the precedence rule. */
  precedence: z.enum(["verified_statistics", "policy_constraint", "human_review"]),
});
export type Conflict = z.infer<typeof ConflictSchema>;

export const TransitionSchema = z.object({ from: WorkflowStateSchema, to: WorkflowStateSchema, at: z.string(), reason: z.string(), actor: z.string() });

export const WorkflowRunSchema = z.object({
  id: z.string(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  organisationId: z.string(),
  createdBy: ActorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  request: AuditRequestSchema,
  state: WorkflowStateSchema,
  paused: z.boolean(),
  cancelRequested: z.boolean(),
  transitions: z.array(TransitionSchema),
  tasks: z.array(TaskRecordSchema),
  approvals: z.array(ApprovalSchema),
  conflicts: z.array(ConflictSchema),
  /** Structured evidence keyed by reference. Reports may only cite these. */
  evidence: z.record(z.string(), z.unknown()),
  usage: UsageSchema.extend({ tasksRun: z.number().int().min(0), durationMs: z.number().min(0) }),
  limits: z.object({ maxTasks: z.number().int().positive().max(40), defaultRetryLimit: z.number().int().min(0).max(3), taskTimeoutMs: z.number().int().positive() }),
  failure: z.string().nullable(),
  datasetHash: z.string().nullable(),
  /** Workspace audit created on completion (links into the Audit Lab). */
  linkedAuditId: z.string().nullable(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

/* ---------- Per-agent finding schemas ---------- */

export const PolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  denials: z.array(z.string()),
  warnings: z.array(z.string()),
  approvalsRequired: z.array(ApprovalSchema.shape.gate),
  jobRelevantFields: z.array(z.string()),
});

export const DataQualitySchema = z.object({
  usable: z.boolean(),
  scopedRecords: z.number().int().min(0),
  checks: z.array(z.object({ id: z.string(), label: z.string(), status: z.enum(["pass", "warn", "fail"]), detail: z.string() })),
  attributeCoverage: z.array(z.object({ attribute: z.string(), present: z.number().int(), missing: z.number().int(), missingRate: z.number() })),
  provenance: z.array(z.object({ importId: z.string(), records: z.number().int() })),
});

export const HypothesisSchema = z.object({
  id: z.string(),
  kind: z.enum(["selection_disparity", "score_disparity"]),
  attribute: z.string(),
  stage: z.string(),
  group: z.string(),
  reference: z.string(),
  claim: z.object({ selected: z.number().int(), n: z.number().int(), refSelected: z.number().int(), refN: z.number().int(), ratio: z.number().nullable(), pValue: z.number() }),
  priority: z.enum(["high", "medium", "low"]),
  rationale: z.string(),
});
export const DiscoverySchema = z.object({ hypotheses: z.array(HypothesisSchema), comparisonsRun: z.number().int().min(0) });

export const ExperimentSchema = z.object({
  cue: z.string(),
  label: z.string(),
  engineVersion: z.string(),
  pairs: z.number().int().positive(),
  seeds: z.array(z.number().int()),
  meanDelta: z.number(),
  minDelta: z.number(),
  maxDelta: z.number(),
  flipRate: z.number().min(0).max(1),
  signTestP: z.number().min(0).max(1),
  reacts: z.boolean(),
  primary: z.boolean(),
});
export const ExperimentsSchema = z.object({ experiments: z.array(ExperimentSchema), target: z.literal("mock_engine"), authorised: z.boolean() });

export const VerdictSchema = z.object({
  hypothesisId: z.string(),
  verdict: z.enum(["verified", "descriptive_only", "rejected"]),
  reasons: z.array(z.string()),
  recomputed: z.object({ selected: z.number().int(), n: z.number().int(), refSelected: z.number().int(), refN: z.number().int(), ratio: z.number().nullable(), ratioLower: z.number().nullable(), ratioUpper: z.number().nullable(), pValue: z.number(), adjustedP: z.number() }).nullable(),
});
export const VerificationSchema = z.object({ verdicts: z.array(VerdictSchema), warnings: z.array(z.string()), familySize: z.number().int().min(0) });

export const MitigationSchema = z.object({
  trials: z.array(
    z.object({
      cue: z.string(),
      strategy: z.string(),
      maskedFields: z.array(z.string()),
      beforeMeanDelta: z.number(),
      afterMeanDelta: z.number(),
      beforeFlipRate: z.number(),
      afterFlipRate: z.number(),
      tradeOffs: z.array(z.string()),
      touchesJobRelevantField: z.boolean(),
    }),
  ),
  recommendations: z.array(z.string()),
});

export const ExplanationSchema = z.object({
  sections: z.array(
    z.object({
      category: z.enum(["observed_disparity", "experimental_sensitivity", "mechanism_hypothesis", "supported_finding", "human_question", "limitation"]),
      text: z.string(),
      evidenceRefs: z.array(z.string()),
    }),
  ),
});

export const ReportPackageSchema = z.object({
  title: z.string(),
  executiveSummary: z.array(z.string()),
  scope: z.record(z.string(), z.unknown()),
  dataset: z.record(z.string(), z.unknown()),
  verifiedResults: z.array(z.unknown()),
  experiments: z.array(z.unknown()),
  mitigation: z.array(z.unknown()),
  findings: z.array(z.unknown()),
  conflicts: z.array(z.unknown()),
  approvals: z.array(z.unknown()),
  limitations: z.array(z.string()),
  appendix: z.record(z.string(), z.unknown()),
});

export const FINDING_SCHEMAS: Record<AgentType, z.ZodTypeAny> = {
  governance: PolicyDecisionSchema,
  data_integrity: DataQualitySchema,
  bias_discovery: DiscoverySchema,
  counterfactual: ExperimentsSchema,
  statistical_verification: VerificationSchema,
  mitigation: MitigationSchema,
  explainability: ExplanationSchema,
  reporting: ReportPackageSchema,
};
