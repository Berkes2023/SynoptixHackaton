import { describe, expect, it } from "vitest";
import { CUE_GROUPS, simulateMitigation } from "../src/lib/fairness/mitigation";
import type { MaskableField } from "../src/lib/fairness/counterfactual";

const BIASED: MaskableField[] = ["nationality", "employmentGap", "postcodeRegion", "nameSet"];
const IGNORED: MaskableField[] = ["pronouns", "cvFormat"];

describe("mitigation simulator (mock screener, synthetic pool)", () => {
  it("prints the before/after table used in the docs", () => {
    for (const cue of Object.keys(CUE_GROUPS) as MaskableField[]) {
      const s = simulateMitigation({ cue });
      console.log(cue, `${s.before.affected.selected}/${s.before.affected.n} vs ${s.before.reference.selected}/${s.before.reference.n}`, s.before.ratio?.toFixed(3), "→", `${s.after.affected.selected}/${s.after.affected.n} vs ${s.after.reference.selected}/${s.after.reference.n}`, s.after.ratio?.toFixed(3), "p", s.before.fisherP.toFixed(4), "→", s.after.fisherP.toFixed(4), "skills", s.before.shortlistSkills.toFixed(3), "→", s.after.shortlistSkills.toFixed(3));
    }
  });

  it.each(BIASED)("masking %s improves the selection-rate ratio for the affected group", (cue) => {
    const s = simulateMitigation({ cue });
    expect(s.before.ratio!).toBeLessThan(s.after.ratio!);
    // Matched pool: with the cue hidden, both groups are shortlisted at the same rate.
    expect(s.after.ratio!).toBe(1);
    expect(s.after.affected.selected).toBe(s.after.reference.selected);
    // Hiding the only biased cue reproduces the job-relevant-only shortlist exactly.
    expect(s.after.meritAgreement).toBe(1);
    expect(s.before.meritAgreement).toBeLessThan(1);
    // Shortlist quality is essentially unchanged; small shifts are reported, not hidden.
    expect(Math.abs(s.after.shortlistSkills - s.before.shortlistSkills)).toBeLessThan(0.01);
  });

  it("shows that passing the four-fifths heuristic does not mean no bias", () => {
    const s = simulateMitigation({ cue: "nationality" });
    // The mock screener penalises the non-UK statement, yet 0.818 is above 0.8.
    expect(s.before.meetsFourFifths).toBe(true);
    expect(s.before.ratio!).toBeLessThan(s.after.ratio!);
  });

  it("fixed reference figures (seed 2026, 400 candidates, 30% shortlisted)", () => {
    const gap = simulateMitigation({ cue: "employmentGap" });
    expect([gap.before.affected.selected, gap.before.reference.selected]).toEqual([49, 71]);
    expect([gap.after.affected.selected, gap.after.reference.selected]).toEqual([60, 60]);
    expect(gap.changes).toEqual({ newlyShortlisted: 11, noLongerShortlisted: 11, newlyShortlistedAffected: 11, noLongerShortlistedReference: 11 });
    const nat = simulateMitigation({ cue: "nationality" });
    expect([nat.before.affected.selected, nat.before.reference.selected]).toEqual([54, 66]);
  });

  it.each(IGNORED)("masking %s changes nothing because the mock screener never used it (control)", (cue) => {
    const s = simulateMitigation({ cue });
    expect(s.after).toEqual(s.before);
    expect(s.changes.newlyShortlisted).toBe(0);
    expect(s.before.ratio!).toBeGreaterThan(0.95);
  });

  it("never removes candidates: pool and shortlist sizes are identical before and after", () => {
    const s = simulateMitigation({ cue: "nationality", poolSize: 500, shortlistRate: 0.25 });
    for (const a of [s.before, s.after]) {
      expect(a.reference.n + a.affected.n).toBe(500);
      expect(a.reference.selected + a.affected.selected).toBe(125);
    }
    // Every newly shortlisted candidate displaces exactly one other.
    expect(s.changes.newlyShortlisted).toBe(s.changes.noLongerShortlisted);
  });

  it("is deterministic for a given seed and differs across seeds", () => {
    expect(simulateMitigation({ cue: "nationality", seed: 7 })).toEqual(simulateMitigation({ cue: "nationality", seed: 7 }));
    expect(simulateMitigation({ cue: "nationality", seed: 7 }).before).not.toEqual(simulateMitigation({ cue: "nationality", seed: 8 }).before);
  });

  it("flags employment gap as potentially job-relevant so a person decides", () => {
    expect(simulateMitigation({ cue: "employmentGap" }).touchesJobRelevantField).toBe(true);
    expect(simulateMitigation({ cue: "nationality" }).touchesJobRelevantField).toBe(false);
  });

  it("removing all four penalised cues together undoes a compounded disadvantage", () => {
    const s = simulateMitigation({ cue: "allBiased" });
    expect([s.before.affected.selected, s.before.reference.selected]).toEqual([29, 91]);
    expect(s.before.ratio!).toBeCloseTo(0.319, 3);
    expect(s.before.fisherP).toBeLessThan(1e-9);
    expect(s.after.ratio).toBe(1);
    // 6 + 3.5 + 4 + 2.5 = 16 points for identical qualifications, gone after masking.
    expect(s.before.scoreGap).toBeCloseTo(-16, 0);
    expect(s.after.scoreGap).toBe(0);
    expect(s.touchesJobRelevantField).toBe(true);
    // Compounded cues hurt more than any single cue.
    for (const cue of ["employmentGap", "postcodeRegion", "nationality", "nameSet"] as const) expect(s.before.ratio!).toBeLessThan(simulateMitigation({ cue }).before.ratio!);
  });

  it("reports the average score gap between identically qualified groups", () => {
    const s = simulateMitigation({ cue: "nationality" });
    expect(s.before.scoreGap).toBeCloseTo(-4, 1);
    expect(s.after.scoreGap).toBe(0);
    expect(simulateMitigation({ cue: "cvFormat" }).before.scoreGap).toBe(0);
  });

  it("rejects out-of-range inputs", () => {
    expect(() => simulateMitigation({ cue: "nationality", poolSize: 5 })).toThrow(RangeError);
    expect(() => simulateMitigation({ cue: "nationality", shortlistRate: 1 })).toThrow(RangeError);
  });
});
