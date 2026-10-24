import type { ScreeningRecord } from "../fairness/types";
import type { Actor, AgentType, AuditRequest } from "./contracts";

/**
 * Deterministic policy. These rules are enforced in code by the orchestrator
 * and data broker; the Governance agent reports on them but cannot override them.
 */
export class PolicyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyViolation";
  }
}

export const ROLES_THAT_MAY_START_AUDITS = ["Admin", "Auditor"];
export const ROLES_THAT_MAY_APPROVE = ["Admin", "Reviewer"];

/** Fields treated as legitimately job-related: mitigation may not silently remove them. */
export const JOB_RELEVANT_FIELDS = ["employmentGap"];

export type DataView = "minimised_records" | "presence_only_records" | "synthetic_profiles" | "evidence" | "policy_context";

/**
 * Which views each agent may request. Explainability and Reporting never see
 * records; only discovery and verification see self-reported categories.
 */
export const AGENT_CAPABILITIES: Record<AgentType, readonly DataView[]> = {
  governance: ["policy_context", "evidence"],
  data_integrity: ["presence_only_records"],
  bias_discovery: ["minimised_records"],
  statistical_verification: ["minimised_records", "evidence"],
  counterfactual: ["synthetic_profiles"],
  mitigation: ["synthetic_profiles", "evidence"],
  explainability: ["evidence"],
  reporting: ["evidence"],
};

export interface OrgPolicy {
  organisationId: string;
  authorisedAttributes: string[];
  minimumGroupSize: number;
  confidenceLevel: number;
  impactThreshold: number;
  alpha: number;
  retentionDays: number;
}

export function evaluateRequest(request: AuditRequest, actor: Actor, policy: OrgPolicy) {
  const denials: string[] = [];
  const warnings: string[] = [];
  if (actor.kind !== "human") denials.push("Audits can only be started by a person.");
  if (!ROLES_THAT_MAY_START_AUDITS.includes(actor.role)) denials.push(`Role "${actor.role}" may not start audits (Admin or Auditor required).`);
  for (const a of request.attributes)
    if (!policy.authorisedAttributes.includes(a)) denials.push(`Category "${a}" is not authorised for this organisation.`);
  if (request.externalAts) denials.push("Testing an external ATS is not enabled in this deployment (requires an authorised test interface and approval).");
  if (request.externalModelProvider) denials.push("Sending data to an external AI provider is not enabled in this deployment.");
  if (request.runMitigation && !request.runExperiments) warnings.push("Mitigation experiments need counterfactual experiments; mitigation will be skipped.");
  if (policy.retentionDays > 365) warnings.push("Retention exceeds 12 months; review the retention policy.");
  return { allowed: denials.length === 0, denials, warnings };
}

export function assertCanApprove(reviewer: Actor, initiator: Actor) {
  if (reviewer.kind !== "human") throw new PolicyViolation("Only a person can approve or reject a review gate. Agents cannot approve requests.");
  if (!ROLES_THAT_MAY_APPROVE.includes(reviewer.role)) throw new PolicyViolation(`Role "${reviewer.role}" may not approve (Reviewer or Admin required).`);
  if (reviewer.id === initiator.id) throw new PolicyViolation("Separation of duties: the person who started the audit cannot approve its findings.");
}

/** Read-only, per-agent access to the workspace. Enforces tenancy and capability. */
export class DataBroker {
  constructor(
    private readonly organisationId: string,
    private readonly records: ScreeningRecord[],
    private readonly evidence: () => Record<string, unknown>,
  ) {}

  private check(agent: AgentType, view: DataView, organisationId: string) {
    if (organisationId !== this.organisationId) throw new PolicyViolation("Cross-tenant access denied.");
    if (!AGENT_CAPABILITIES[agent].includes(view)) throw new PolicyViolation(`Agent "${agent}" is not permitted to access ${view.replace(/_/g, " ")}.`);
  }

  private scoped(ref: string): ScreeningRecord[] {
    const m = /^dataset:([^/]+)\/(.+)$/.exec(ref);
    if (!m) throw new PolicyViolation(`Unknown data reference "${ref}".`);
    return this.records.filter((r) => r.jobRef === m[1] && r.stage === m[2]);
  }

  /** Records with only the authorised categories, copied so originals stay immutable. */
  minimisedRecords(agent: AgentType, organisationId: string, ref: string, attributes: string[]): ScreeningRecord[] {
    this.check(agent, "minimised_records", organisationId);
    return this.scoped(ref).map(({ importId: _i, ...r }) => ({
      ...r,
      sensitive: Object.fromEntries(attributes.map((a) => [a, r.sensitive[a] ?? null])),
    }));
  }

  /** Records where each category is replaced by whether a value is present. */
  presenceOnlyRecords(agent: AgentType, organisationId: string, ref: string, attributes: string[]) {
    this.check(agent, "presence_only_records", organisationId);
    return this.scoped(ref).map(({ sensitive, ...r }) => ({
      ...r,
      present: Object.fromEntries(attributes.map((a) => [a, sensitive[a] != null])),
    }));
  }

  evidenceView(agent: AgentType, organisationId: string): Record<string, unknown> {
    this.check(agent, "evidence", organisationId);
    return structuredClone(this.evidence());
  }

  syntheticProfiles(agent: AgentType, organisationId: string) {
    this.check(agent, "synthetic_profiles", organisationId);
    return true;
  }

  policyContext(agent: AgentType, organisationId: string) {
    this.check(agent, "policy_context", organisationId);
    return true;
  }
}
