import { toCsv } from "../ingest/csv";
import { gaussian, mulberry32, shuffle } from "../random";

/**
 * Deterministic synthetic "Workday-style" ATS export. FICTIONAL DATA ONLY —
 * not real Workday screening results and not derived from real candidates.
 *
 * REQ-1042 Software Engineer, initial_screening: 200 applications
 *   Male 40/100 advanced, Female 25/100 advanced (ratio 0.625 — the PRD fixture)
 *   65 advanced candidates continue to an assessment stage.
 * REQ-1077 Data Analyst, assessment: 60 applications, 40% gender not disclosed.
 *
 * Nationality is a self-reported, fictional column. It is not citizenship and
 * says nothing about right to work, which is a separate legal question.
 */
export const SYNTHETIC_DATASET_NAME = "deeptrace_synthetic_workday_style_v1.csv";
export const SYNTHETIC_SEED = 20261024;

export const SYNTHETIC_HEADERS = [
  "Application ID",
  "Candidate Ref",
  "Job Req ID",
  "Job Title",
  "Department",
  "Applied Date",
  "Stage",
  "AI Score",
  "Grade",
  "Screening Decision",
  "Decision Date",
  "Source System",
  "Gender (self-reported)",
  "Age Band (self-reported)",
  "Nationality (self-reported)",
  "Recruiter Notes",
];

const SOURCE = "mock_workday_style";

function grade(score: number): string {
  return score >= 75 ? "A" : score >= 60 ? "B" : score >= 45 ? "C" : "D";
}

const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10;

function isoDate(base: Date, addDays: number): string {
  return new Date(base.getTime() + addDays * 86400000).toISOString().slice(0, 10);
}

export function generateSyntheticRows(seed = SYNTHETIC_SEED): (string | number | null)[][] {
  const rand = mulberry32(seed);
  const rows: (string | number | null)[][] = [];
  const start = new Date(Date.UTC(2026, 8, 1));

  // --- REQ-1042 Software Engineer: initial screening ---
  type Seed = { gender: string; advanced: boolean };
  const se: Seed[] = [];
  for (let i = 0; i < 100; i++) se.push({ gender: "Male", advanced: i < 40 });
  for (let i = 0; i < 100; i++) se.push({ gender: "Female", advanced: i < 25 });
  const ordered = shuffle(se, rand);

  // Age band assigned with fixed counts so the fixture is stable: no material age disparity.
  const advanced = shuffle(ordered.filter((s) => s.advanced), rand);
  const rejected = shuffle(ordered.filter((s) => !s.advanced), rand);
  const ageOf = new Map<Seed, string>();
  advanced.forEach((s, i) => ageOf.set(s, i < 2 ? "Prefer not to say" : i < 45 ? "Under 40" : "40 and over"));
  rejected.forEach((s, i) => ageOf.set(s, i < 8 ? "Prefer not to say" : i < 95 ? "Under 40" : "40 and over"));
  // Nationality with fixed counts (UK 45/120 advanced vs non-UK 17/69), spread by a stride so it is not tied to age.
  // No extra random draws, so every other value in the fixture is unchanged.
  const natOf = new Map<Seed, string>();
  const nat = (slot: number, pnts: number, nonUk: number) => (slot < pnts ? "Prefer not to say" : slot < pnts + nonUk ? "Non-UK national" : "UK national");
  advanced.forEach((s, i) => natOf.set(s, nat((i * 7) % advanced.length, 3, 17)));
  rejected.forEach((s, i) => natOf.set(s, nat((i * 7) % rejected.length, 8, 52)));

  const assessmentQueue: { appId: string; cand: string; gender: string; age: string; nat: string; applied: string; score: number }[] = [];
  ordered.forEach((s, i) => {
    const n = String(i + 1).padStart(4, "0");
    const appId = `APP-SE-${n}`;
    const cand = `CAND-${n}`;
    const day = Math.floor(rand() * 28);
    const applied = isoDate(start, day);
    const score = s.advanced ? clamp(gaussian(rand, 73, 7), 55, 99) : clamp(gaussian(rand, 50, 9), 10, 70);
    rows.push([
      appId, cand, "REQ-1042", "Software Engineer", "Engineering", applied, "initial_screening",
      score, grade(score), s.advanced ? "Advance" : "Reject", isoDate(start, day + 2), SOURCE,
      s.gender, ageOf.get(s)!, natOf.get(s)!, "",
    ]);
    if (s.advanced) assessmentQueue.push({ appId, cand, gender: s.gender, age: ageOf.get(s)!, nat: natOf.get(s)!, applied, score });
  });

  // --- REQ-1042 assessment stage (the 65 advanced candidates) ---
  let maleAdv = 0;
  let femaleAdv = 0;
  for (const a of assessmentQueue) {
    const pass = a.gender === "Male" ? maleAdv++ < 22 : femaleAdv++ < 14;
    const score = pass ? clamp(gaussian(rand, 78, 6), 60, 99) : clamp(gaussian(rand, 58, 8), 30, 74);
    rows.push([
      a.appId, a.cand, "REQ-1042", "Software Engineer", "Engineering", a.applied, "assessment",
      score, grade(score), pass ? "Advance" : "Reject", isoDate(new Date(Date.parse(a.applied)), 9), SOURCE,
      a.gender, a.age, a.nat, "",
    ]);
  }

  // --- REQ-1077 Data Analyst: assessment, poor demographic coverage ---
  const da: { gender: string; advanced: boolean }[] = [];
  for (let i = 0; i < 18; i++) da.push({ gender: "Female", advanced: i < 6 });
  for (let i = 0; i < 18; i++) da.push({ gender: "Male", advanced: i < 6 });
  for (let i = 0; i < 14; i++) da.push({ gender: "Not disclosed", advanced: i < 4 });
  for (let i = 0; i < 10; i++) da.push({ gender: "", advanced: i < 2 });
  shuffle(da, rand).forEach((s, i) => {
    const n = String(i + 1).padStart(4, "0");
    const day = Math.floor(rand() * 28);
    const score = s.advanced ? clamp(gaussian(rand, 70, 8), 50, 99) : clamp(gaussian(rand, 52, 9), 10, 70);
    const missingScore = i % 20 === 7;
    rows.push([
      `APP-DA-${n}`, `CAND-${String(500 + i).padStart(4, "0")}`, "REQ-1077", "Data Analyst", "Analytics",
      isoDate(start, day), "assessment", missingScore ? null : score, missingScore ? null : grade(score),
      s.advanced ? "Advance" : "Reject", isoDate(start, day + 5), SOURCE, s.gender,
      rand() < 0.7 ? "Under 40" : "40 and over", ["UK national", "Non-UK national", "UK national", "", "Prefer not to say"][i % 5], i % 9 === 0 ? "Synthetic note — dropped on import" : "",
    ]);
  });

  return rows;
}

export function generateSyntheticCsv(seed = SYNTHETIC_SEED): string {
  return toCsv(SYNTHETIC_HEADERS, generateSyntheticRows(seed));
}
