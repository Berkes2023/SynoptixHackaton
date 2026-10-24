import { generateSyntheticCsv } from "../data/synthetic";
import { runAudit } from "../fairness/audit";
import type { AuditConfig, AuditResult, ScreeningRecord } from "../fairness/types";
import { parseCsv } from "../ingest/csv";
import { autoMap } from "../ingest/mapping";
import { validateAndMap } from "../ingest/validate";

/** The fictional employer used across the public site and the guided demo. */
export const DEMO_EMPLOYER = {
  name: "Northwind Demo Ltd",
  note: "a fictional employer",
};

let cached: ScreeningRecord[] | null = null;

/** The same deterministic synthetic dataset the Data Hub offers, parsed and validated. */
export function demoRecords(): ScreeningRecord[] {
  if (!cached) {
    const { headers, rows } = parseCsv(generateSyntheticCsv());
    cached = validateAndMap(headers, rows, autoMap(headers)).records;
  }
  return cached;
}

export function demoConfig(overrides: Partial<AuditConfig> = {}): AuditConfig {
  return {
    jobRef: "REQ-1042",
    stage: "initial_screening",
    analysisType: "observational",
    groupingAttribute: "gender",
    metrics: ["selection_rate", "selection_rate_ratio", "score_distribution"],
    confidenceLevel: 0.95,
    minimumGroupSize: 20,
    impactThreshold: 0.8,
    alpha: 0.05,
    ...overrides,
  };
}

/** Real engine output for the headline case study (computed, never hard-coded). */
export function demoAudit(overrides: Partial<AuditConfig> = {}): AuditResult {
  return runAudit(demoRecords(), demoConfig(overrides));
}
