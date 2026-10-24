import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/fairness/audit";
import type { AuditConfig, ScreeningRecord } from "@/lib/fairness/types";
import { runCounterfactual } from "@/lib/fairness/counterfactual";

function makeRecords(groups: { group: string | null; total: number; selected: number }[], jobRef = "REQ-1"): ScreeningRecord[] {
  const out: ScreeningRecord[] = [];
  let i = 0;
  for (const g of groups) {
    for (let k = 0; k < g.total; k++) {
      i++;
      out.push({
        applicationId: `A-${String(i).padStart(4, "0")}`,
        candidateRef: `C-${i}`,
        jobRef,
        jobTitle: "Fixture role",
        department: null,
        appliedAt: null,
        stage: "initial_screening",
        score: k < g.selected ? 70 + (k % 10) : 40 + (k % 10),
        grade: null,
        decision: k < g.selected ? "Advance" : "Reject",
        decisionAt: "2026-09-01T00:00:00.000Z",
        sourceSystem: "fixture",
        sensitive: { gender: g.group },
      });
    }
  }
  return out;
}

const config: AuditConfig = {
  jobRef: "REQ-1",
  stage: "initial_screening",
  analysisType: "observational",
  groupingAttribute: "gender",
  metrics: ["selection_rate", "selection_rate_ratio", "score_distribution"],
  confidenceLevel: 0.95,
  minimumGroupSize: 20,
  impactThreshold: 0.8,
  alpha: 0.05,
};

describe("runAudit — PRD fixture (40/100 vs 25/100)", () => {
  const records = makeRecords([
    { group: "Group A", total: 100, selected: 40 },
    { group: "Group B", total: 100, selected: 25 },
  ]);
  const result = runAudit(records, config);

  it("reports numerators, denominators and rates", () => {
    const a = result.groups.find((g) => g.group === "Group A")!;
    const b = result.groups.find((g) => g.group === "Group B")!;
    expect([a.n, a.selected, a.selectionRate]).toEqual([100, 40, 0.4]);
    expect([b.n, b.selected, b.selectionRate]).toEqual([100, 25, 0.25]);
    expect(result.sample.analysed).toBe(200);
  });

  it("computes the selection-rate ratio 0.625 against the highest-rate reference", () => {
    expect(result.referenceGroup).toBe("Group A");
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0].ratio).toBeCloseTo(0.625, 12);
    expect(result.comparisons[0].belowThreshold).toBe(true);
    expect(result.comparisons[0].rateDifference).toBeCloseTo(-0.15, 12);
  });

  it("flags for investigation without making a legal determination", () => {
    expect(result.flag).toBe("investigation_recommended");
    expect(result.conclusion).toMatch(/No determination of unlawful discrimination/);
    expect(result.findings[0].category).toBe("selection_disparity");
    expect(result.findings[0].limitations.join(" ")).toMatch(/not a legal test/);
  });

  it("is deterministic and independent of input order", () => {
    const again = runAudit([...records].reverse(), config);
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });
});

describe("runAudit — fairness rules", () => {
  it("never treats missing demographics as a group", () => {
    const r = runAudit(
      makeRecords([
        { group: "Group A", total: 30, selected: 10 },
        { group: "Group B", total: 30, selected: 10 },
        { group: null, total: 15, selected: 5 },
        { group: "Not disclosed", total: 10, selected: 2 },
        { group: "Prefer not to say", total: 5, selected: 1 },
      ]),
      config,
    );
    expect(r.groups.map((g) => g.group)).toEqual(["Group A", "Group B"]);
    expect(r.sample.missingAttribute).toBe(30);
    expect(r.findings.some((f) => f.category === "data_quality" && f.title.startsWith("Missing demographic coverage"))).toBe(true);
  });

  it("suppresses small groups and withholds their counts", () => {
    const r = runAudit(
      makeRecords([
        { group: "Group A", total: 50, selected: 20 },
        { group: "Group B", total: 50, selected: 20 },
        { group: "Group C", total: 7, selected: 0 },
      ]),
      config,
    );
    const c = r.groups.find((g) => g.group === "Group C")!;
    expect(c.suppressed).toBe(true);
    expect(c.n).toBeNull();
    expect(c.selected).toBeNull();
    expect(r.comparisons.map((x) => x.group)).not.toContain("Group C");
  });

  it("reports insufficient data when fewer than two groups are reportable", () => {
    const r = runAudit(makeRecords([{ group: "Group A", total: 15, selected: 5 }, { group: "Group B", total: 12, selected: 6 }]), config);
    expect(r.flag).toBe("insufficient_data");
    expect(r.comparisons).toHaveLength(0);
  });

  it("does not flag equal selection rates", () => {
    const r = runAudit(makeRecords([{ group: "Group A", total: 60, selected: 30 }, { group: "Group B", total: 60, selected: 30 }]), config);
    expect(r.flag).toBe("no_flag");
  });

  it("only analyses the requested job and stage", () => {
    const r = runAudit(
      [...makeRecords([{ group: "Group A", total: 40, selected: 20 }]), ...makeRecords([{ group: "Group B", total: 40, selected: 0 }], "REQ-OTHER")],
      config,
    );
    expect(r.sample.scopedRecords).toBe(40);
  });
});

describe("counterfactual lab (mock engine)", () => {
  it("detects the injected employment-gap penalty and ignores the control cue", () => {
    const gap = runCounterfactual({ cue: "employmentGap", pairCount: 50, seed: 7, threshold: 60 });
    expect(gap.meanDelta).toBeLessThan(-4);
    expect(gap.signTestP).toBeLessThan(0.001);
    const control = runCounterfactual({ cue: "cvFormat", pairCount: 50, seed: 7, threshold: 60 });
    expect(control.meanDelta).toBe(0);
    expect(control.flips).toBe(0);
    expect(control.signTestP).toBe(1);
  });
  it("is reproducible for a given seed", () => {
    const a = runCounterfactual({ cue: "postcodeRegion", pairCount: 30, seed: 99, threshold: 60 });
    const b = runCounterfactual({ cue: "postcodeRegion", pairCount: 30, seed: 99, threshold: 60 });
    expect(a).toEqual(b);
  });
});
