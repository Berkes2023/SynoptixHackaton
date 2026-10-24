import { describe, expect, it } from "vitest";
import { GENERATOR_SIZES, datasetToCsv, datasetToJson, generateDataset, jsonToTable, type Scenario } from "@/lib/data/generator";
import { runAudit } from "@/lib/fairness/audit";
import { computeDrift } from "@/lib/fairness/drift";
import type { AuditConfig } from "@/lib/fairness/types";
import { parseCsv } from "@/lib/ingest/csv";
import { autoMap } from "@/lib/ingest/mapping";
import { validateAndMap } from "@/lib/ingest/validate";
import { createAuthorisedExternalEngine, MockScreeningEngine } from "@/lib/adapters";

function importCsv(text: string) {
  const { headers, rows } = parseCsv(text);
  return validateAndMap(headers, rows, autoMap(headers));
}

const cfg = (jobRef: string, overrides: Partial<AuditConfig> = {}): AuditConfig => ({
  jobRef,
  stage: "initial_screening",
  analysisType: "observational",
  groupingAttribute: "synthetic_group",
  metrics: ["selection_rate", "selection_rate_ratio"],
  confidenceLevel: 0.95,
  minimumGroupSize: 20,
  impactThreshold: 0.8,
  alpha: 0.05,
  ...overrides,
});

describe("synthetic dataset generator", () => {
  it.each(GENERATOR_SIZES)("produces exactly %i candidates with one screening row each", (size) => {
    const ds = generateDataset({ size, job: "software", seed: 11, scenario: "balanced" });
    expect(ds.candidates).toHaveLength(size);
    expect(ds.applications.filter((a) => a.Stage === "initial_screening")).toHaveLength(size);
    expect(new Set(ds.candidates.map((c) => c.candidateRef)).size).toBe(size);
  });

  it("is reproducible for a seed and different across seeds", () => {
    const a = datasetToCsv(generateDataset({ size: 250, job: "data", seed: 5, scenario: "proxy_gap" }));
    expect(datasetToCsv(generateDataset({ size: 250, job: "data", seed: 5, scenario: "proxy_gap" }))).toBe(a);
    expect(datasetToCsv(generateDataset({ size: 250, job: "data", seed: 6, scenario: "proxy_gap" }))).not.toBe(a);
  });

  it("rejects unsupported options", () => {
    expect(() => generateDataset({ size: 123 as never, job: "software", seed: 1, scenario: "balanced" })).toThrow();
    expect(() => generateDataset({ size: 100, job: "nope" as never, seed: 1, scenario: "balanced" })).toThrow();
  });

  it("round-trips through CSV and JSON import without data loss", () => {
    const ds = generateDataset({ size: 500, job: "finance", seed: 3, scenario: "missing_data" });
    const csv = importCsv(datasetToCsv(ds));
    expect(csv.report.excludedRows).toBe(0);
    expect(csv.records).toHaveLength(ds.applications.length);
    const { headers, rows } = jsonToTable(datasetToJson(ds));
    const json = validateAndMap(headers, rows, autoMap(headers));
    expect(json.records).toEqual(csv.records);
    expect(json.records.every((r) => r.scoringVersion === "v1")).toBe(true);
  });

  it("never includes names, emails or free text about candidates", () => {
    const text = datasetToJson(generateDataset({ size: 100, job: "customer", seed: 9, scenario: "balanced" }));
    expect(text).not.toMatch(/@|"name"|https?:\/\//i);
  });

  const ratio = (scenario: Scenario) => {
    const ds = generateDataset({ size: 1000, job: "software", seed: 42, scenario });
    const r = runAudit(importCsv(datasetToCsv(ds)).records, cfg(`SYN-SWE-42`));
    return r.comparisons[0]?.ratio ?? null;
  };

  it("balanced scenario shows no flagged disparity", () => {
    expect(ratio("balanced")!).toBeGreaterThan(0.85);
  });

  it.each(["selection_disparity", "score_shift", "proxy_gap"] as const)("%s scenario produces a ratio below 0.8", (s) => {
    expect(ratio(s)!).toBeLessThan(0.8);
  });

  it("missing_data scenario raises a coverage finding and never groups missing values", () => {
    const ds = generateDataset({ size: 1000, job: "software", seed: 42, scenario: "missing_data" });
    const r = runAudit(importCsv(datasetToCsv(ds)).records, cfg("SYN-SWE-42"));
    expect(r.groups.map((g) => g.group)).toEqual(["Group A", "Group B"]);
    expect(r.sample.missingAttributeRate).toBeGreaterThan(0.25);
    expect(r.findings.some((f) => f.key === "data:missing-attribute")).toBe(true);
  });
});

describe("bias drift", () => {
  const ds = generateDataset({ size: 1000, job: "software", seed: 42, scenario: "drift" });
  const records = importCsv(datasetToCsv(ds)).records;

  it("by scoring version: v1 fair, v2 below threshold, with an alert", () => {
    const { periods, alerts } = computeDrift(records, cfg("SYN-SWE-42"), "scoringVersion");
    expect(periods.map((p) => p.period)).toEqual(["v1", "v2"]);
    expect(periods[0].ratio!).toBeGreaterThan(0.8);
    expect(periods[1].ratio!).toBeLessThan(0.8);
    expect(alerts.map((a) => a.kind)).toContain("crossed_below_threshold");
  });

  it("by month: six periods, deterministic", () => {
    const a = computeDrift(records, cfg("SYN-SWE-42"), "month");
    expect(a.periods).toHaveLength(6);
    expect(computeDrift([...records].reverse(), cfg("SYN-SWE-42"), "month")).toEqual(a);
  });
});

describe("adapters", () => {
  it("mock engine scores; external engine refuses without authorisation", async () => {
    expect(await MockScreeningEngine.score({ id: "x", yearsExperience: 5, skillsMatch: 0.5, assessmentScore: 70, employmentGap: false, postcodeRegion: "Region S", cvFormat: "single-column" })).toBeGreaterThan(0);
    const ext = createAuthorisedExternalEngine({});
    expect(ext.authorised).toBe(false);
    await expect(ext.score({} as never)).rejects.toThrow(/not enabled/);
  });
});
