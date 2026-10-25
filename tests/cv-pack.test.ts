import { describe, expect, it } from "vitest";
import { CV_PACK_AS_OF, generateCvPack } from "../src/lib/data/cv-pack";
import { RESUME_PACK, yearsOfExperience } from "../src/lib/data/resumes";

const DAY = 86400000;

describe("realistic fictional CV pack", () => {
  const years = RESUME_PACK.map(yearsOfExperience);

  it("has a realistic spread of experience, not one repeated value", () => {
    expect(new Set(years).size).toBeGreaterThan(80);
    expect(Math.min(...years)).toBeLessThan(1);
    expect(Math.max(...years)).toBeGreaterThan(15);
    const early = years.filter((y) => y < 2).length;
    const senior = years.filter((y) => y >= 10).length;
    expect(early).toBeGreaterThan(20);
    expect(senior).toBeGreaterThan(20);
  });

  it("is deterministic and stable", () => {
    expect(generateCvPack()).toEqual(RESUME_PACK);
    expect(generateCvPack(200, 1)).not.toEqual(RESUME_PACK);
  });

  it("has well-formed careers: most recent first, no overlaps, nothing after the as-of date", () => {
    const asOf = Date.parse(CV_PACK_AS_OF);
    for (const r of RESUME_PACK) {
      expect(Date.parse(r.work[0].endDate)).toBeLessThanOrEqual(asOf);
      for (const [i, job] of r.work.entries()) {
        expect(Date.parse(job.startDate)).toBeLessThan(Date.parse(job.endDate));
        expect(job.highlights.length).toBeGreaterThanOrEqual(2);
        const older = r.work[i + 1];
        if (older) {
          const gapDays = (Date.parse(job.startDate) - Date.parse(older.endDate)) / DAY;
          // Short moves between jobs only: a career break is a cue the lab adds, never baked in.
          expect(gapDays).toBeGreaterThan(0);
          expect(gapDays).toBeLessThan(90);
        }
      }
    }
  });

  it("gives more senior titles to longer careers", () => {
    const title = (r: (typeof RESUME_PACK)[number]) => r.work[0].position;
    const juniors = RESUME_PACK.filter((r) => yearsOfExperience(r) < 1.5).map(title);
    const veterans = RESUME_PACK.filter((r) => yearsOfExperience(r) >= 16).map(title);
    expect(juniors.every((t) => /Graduate|Junior|QA Tester/.test(t))).toBe(true);
    expect(veterans.every((t) => /Principal|Head of/.test(t))).toBe(true);
  });

  it("contains no identifying details or real-world contact data", () => {
    const text = JSON.stringify(RESUME_PACK);
    expect(text).not.toMatch(/@|https?:\/\/|\b\d{5,}\b|phone|address|linkedin/i);
    for (const r of RESUME_PACK) expect(Object.keys(r).sort()).toEqual(["id", "summary", "work"]);
  });
});
