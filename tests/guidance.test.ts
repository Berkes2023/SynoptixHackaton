import { describe, expect, it } from "vitest";
import { auditGuidance, confidenceMismatch, matchingConfidence, type GuidanceInput } from "../src/lib/fairness/guidance";
import { demoRecords } from "../src/lib/site/demo-data";

const base: GuidanceInput = {
  records: demoRecords(),
  jobRef: "REQ-1042",
  stage: "initial_screening",
  attribute: "gender",
  confidence: 0.95,
  alpha: 0.05,
  minGroup: 20,
  metrics: ["selection_rate", "selection_rate_ratio", "score_distribution"],
};
const of = (input: Partial<GuidanceInput>, setting?: string) => auditGuidance({ ...base, ...input }).filter((g) => !setting || g.setting === setting);

describe("confidence vs significance consistency", () => {
  it("matches when confidence = 1 − α", () => {
    expect(matchingConfidence(0.05)).toBe(0.95);
    expect(confidenceMismatch(0.95, 0.05)).toBeNull();
    expect(confidenceMismatch(0.99, 0.01)).toBeNull();
  });

  it("explains both directions of mismatch", () => {
    expect(confidenceMismatch(0.99, 0.05)).toMatch(/include 'no difference'.*Choose 95%/);
    expect(confidenceMismatch(0.9, 0.05)).toMatch(/narrower than the test.*Choose 95%/);
  });
});

describe("audit setting guidance", () => {
  it("is silent for the well-specified default audit of the fixture", () => {
    expect(of({})).toEqual([]);
  });

  it("warns when confidence does not match α", () => {
    const g = of({ confidence: 0.99 }, "confidence");
    expect(g).toHaveLength(1);
    expect(g[0].level).toBe("warning");
  });

  it("warns about low self-reporting and notes small and suppressed groups", () => {
    // REQ-1077: 40% of applicants did not disclose gender; groups of 18, 18 and 14.
    const g = of({ jobRef: "REQ-1077", stage: "assessment" });
    expect(g.find((x) => x.setting === "category")?.message).toMatch(/did not report this category/);
    expect(g.find((x) => x.setting === "minGroup")?.message).toMatch(/Female \(18\)|Not disclosed \(14\)/);
  });

  it("warns that fewer than two groups can be compared", () => {
    expect(of({ jobRef: "REQ-1077", stage: "assessment" }, "minGroup").some((g) => /Fewer than two groups/.test(g.message))).toBe(true);
  });

  it("warns about very small minimum group sizes", () => {
    expect(of({ minGroup: 5 }, "minGroup")[0].message).toMatch(/expose individuals/);
  });

  it("notes when the impact-ratio check is switched off", () => {
    expect(of({ metrics: ["selection_rate"] }, "metrics")[0].message).toMatch(/four-fifths check is not run/);
  });

  it("notes small groups mean weak evidence of fairness", () => {
    // REQ-1077 with a minimum of 10: groups of 18, 18 and 14 are reportable but small.
    expect(of({ jobRef: "REQ-1077", stage: "assessment", minGroup: 10 }, "stage")[0].message).toMatch(/fewer than 50 applicants/);
    // REQ-1042 nationality groups (120 and 69) are large enough: no such note.
    expect(of({ attribute: "nationality" }, "stage")).toEqual([]);
  });
});
