import { describe, expect, it } from "vitest";
import { RESUME_PACK, diffResumes, renderResume, yearsOfExperience } from "@/lib/data/resumes";
import { NEUTRAL_PROFILE, applyCue, runCounterfactual, type SyntheticProfile } from "@/lib/fairness/counterfactual";

const bases = RESUME_PACK.map((r) => ({ id: r.id, yearsExperience: yearsOfExperience(r) }));

describe("résumé pack", () => {
  it("contains 200 CVs with no identifying or demographic fields", () => {
    expect(RESUME_PACK).toHaveLength(200);
    for (const r of RESUME_PACK) {
      expect(Object.keys(r).sort()).toEqual(["id", "summary", "work"]);
      expect(r.work.length).toBeGreaterThanOrEqual(1);
      expect(r.work.length).toBeLessThanOrEqual(6);
      for (const w of r.work) expect(Object.keys(w).sort()).toEqual(["company", "endDate", "highlights", "position", "startDate"]);
    }
    expect(JSON.stringify(RESUME_PACK)).not.toMatch(/@|https?:\/\//);
  });

  it("derives experience from work history", () => {
    const r = { id: "X", summary: "", work: [
      { company: "A", position: "Dev", startDate: "2018-01-01", endDate: "2020-01-01", highlights: [] },
      { company: "B", position: "Dev", startDate: "2015-01-01", endDate: "2016-01-01", highlights: [] },
    ] };
    expect(yearsOfExperience(r)).toBe(3);
  });
});

describe("résumé diff", () => {
  const r = RESUME_PACK[0];
  const profile: SyntheticProfile = { id: r.id, yearsExperience: yearsOfExperience(r), skillsMatch: 0.5, assessmentScore: 70, ...NEUTRAL_PROFILE };

  it.each([
    ["employmentGap", 0, 1, /Career break/],
    ["postcodeRegion", 1, 1, /Northfield/],
    ["cvFormat", 1, 1, /Two-column/],
    ["pronouns", 1, 1, /she\/her/],
    ["nationality", 1, 1, /Non-UK national/],
    ["nameSet", 1, 1, /Name set B/],
    ["pronounsXnationality", 2, 2, /she\/her|Non-UK/],
  ] as const)("cue %s changes only the expected lines", (cue, removed, added, pattern) => {
    const d = diffResumes(renderResume(r, applyCue(profile, cue, false)), renderResume(r, applyCue(profile, cue, true)));
    expect(d.removed.size).toBe(removed);
    expect(d.added.size).toBe(added);
    expect([...d.added][0]).toMatch(pattern);
  });
});

describe("new cues and masking", () => {
  it("never changes right to work, and masking removes the injected sensitivity", () => {
    const nat = runCounterfactual({ cue: "nationality", pairCount: 60, seed: 3, threshold: 60, bases });
    expect(nat.meanDelta).toBeCloseTo(-4, 1);
    expect(nat.pairs.every((p) => p.base.rightToWork === "Yes")).toBe(true);
    const masked = runCounterfactual({ cue: "nationality", pairCount: 60, seed: 3, threshold: 60, bases, mask: ["nationality"] });
    expect(masked.meanDelta).toBe(0);
    expect(runCounterfactual({ cue: "pronouns", pairCount: 60, seed: 3, threshold: 60, bases }).meanDelta).toBe(0);
    expect(runCounterfactual({ cue: "pronounsXnationality", pairCount: 60, seed: 3, threshold: 60, bases }).meanDelta).toBeCloseTo(-4, 1);
  });
});

describe("counterfactual lab with résumé bases", () => {
  it("uses each CV at most once and keeps its experience", () => {
    const res = runCounterfactual({ cue: "employmentGap", pairCount: 500, seed: 3, threshold: 60, bases });
    expect(res.pairs).toHaveLength(RESUME_PACK.length);
    expect(new Set(res.pairs.map((p) => p.id)).size).toBe(RESUME_PACK.length);
    const p = res.pairs[0];
    expect(p.base.yearsExperience).toBe(bases.find((b) => b.id === p.id)!.yearsExperience);
  });

  it("still detects the injected gap penalty and ignores the control cue", () => {
    expect(runCounterfactual({ cue: "employmentGap", pairCount: 60, seed: 3, threshold: 60, bases }).meanDelta).toBeLessThan(-4);
    const control = runCounterfactual({ cue: "cvFormat", pairCount: 60, seed: 3, threshold: 60, bases });
    expect(control.meanDelta).toBe(0);
    expect(control.flips).toBe(0);
  });
});
