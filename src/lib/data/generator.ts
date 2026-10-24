import { toCsv } from "../ingest/csv";
import { gaussian, mulberry32, shuffle } from "../random";

/**
 * Native synthetic candidate & screening-outcome generator. Inspired by the
 * JSON Resume structure (jsonresume-fake, Unlicense) but fully rule-based and
 * deterministic: the same options always produce the same dataset. Output is
 * FICTIONAL and labelled as such; it never contains real candidate data.
 *
 * Audit categories are abstract ("Group A"/"Group B") — a controlled synthetic
 * attribute for testing, not a stand-in for any real protected characteristic.
 */
export const GENERATOR_SIZES = [100, 250, 500, 1000] as const;
export type GeneratorSize = (typeof GENERATOR_SIZES)[number];

export const JOB_CATEGORIES = {
  software: { title: "Software Engineer", department: "Engineering", ref: "SYN-SWE", skills: ["TypeScript", "Python", "SQL", "AWS", "React", "Go", "Docker", "Testing"], quals: ["BSc Computer Science", "BEng Software Engineering", "MSc Computing", "Bootcamp certificate", "BSc Mathematics"] },
  data: { title: "Data Analyst", department: "Analytics", ref: "SYN-DA", skills: ["SQL", "Python", "Excel", "Tableau", "Statistics", "dbt", "R", "Power BI"], quals: ["BSc Statistics", "BSc Economics", "MSc Data Science", "BA Psychology", "Professional certificate"] },
  customer: { title: "Customer Success Manager", department: "Customer", ref: "SYN-CSM", skills: ["Account management", "CRM", "Onboarding", "Negotiation", "Reporting", "Salesforce", "Training", "Retention"], quals: ["BA Business", "BA Marketing", "HND Business", "BA Communications", "No degree"] },
  finance: { title: "Finance Associate", department: "Finance", ref: "SYN-FIN", skills: ["IFRS", "Excel", "Reconciliations", "Forecasting", "SAP", "Budgeting", "Audit", "VBA"], quals: ["BSc Accounting", "BSc Economics", "ACCA (part)", "CIMA (part)", "BA Business"] },
} as const;
export type JobCategory = keyof typeof JOB_CATEGORIES;

export const SCENARIOS = {
  balanced: { label: "Balanced", description: "No built-in disparity. Differences arise only from random variation." },
  selection_disparity: { label: "Selection disparity", description: "Group B faces a higher decision cut-off at initial screening." },
  score_shift: { label: "Score shift", description: "ATS scores for Group B are shifted down by a fixed amount." },
  proxy_gap: { label: "Proxy (employment gap)", description: "Career gaps are penalised and occur more often in Group B — an indirect, proxy effect." },
  missing_data: { label: "Missing data", description: "About a third of applicants do not disclose their audit category." },
  drift: { label: "Drift after version change", description: "Six months of data; scoring v2 (months 4–6) disadvantages Group B." },
} as const;
export type Scenario = keyof typeof SCENARIOS;

export interface GeneratorOptions {
  size: GeneratorSize;
  job: JobCategory;
  seed: number;
  scenario: Scenario;
}

export interface GeneratedCandidate {
  candidateRef: string;
  qualification: string;
  skills: string[];
  work: { position: string; months: number }[];
  experienceMonths: number;
  employmentGapMonths: number;
}

export const GENERATED_HEADERS = [
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
  "Scoring Version",
  "Audit Group (synthetic)",
  "Age Band (self-reported)",
] as const;
export type GeneratedRow = Record<(typeof GENERATED_HEADERS)[number], string | number | null>;

export interface GeneratedDataset {
  format: "deeptrace-synthetic-v1";
  dataType: "synthetic";
  options: GeneratorOptions;
  candidates: GeneratedCandidate[];
  applications: GeneratedRow[];
}

const SOURCE = "deeptrace_generator";
const grade = (s: number) => (s >= 75 ? "A" : s >= 60 ? "B" : s >= 45 ? "C" : "D");
const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const day = (start: number, d: number) => new Date(start + d * 86400000).toISOString().slice(0, 10);

export function generateDataset(opts: GeneratorOptions): GeneratedDataset {
  if (!GENERATOR_SIZES.includes(opts.size)) throw new RangeError("size must be 100, 250, 500 or 1000");
  if (!(opts.job in JOB_CATEGORIES)) throw new RangeError("unknown job category");
  if (!(opts.scenario in SCENARIOS)) throw new RangeError("unknown scenario");
  const rand = mulberry32(Math.trunc(opts.seed) || 1);
  const job = JOB_CATEGORIES[opts.job];
  const jobRef = `${job.ref}-${opts.seed}`;
  // Drift spans exactly Jan–Jun 2026 by decision date (day 0 = 1 Jan; decisions ≤ day 180 = 30 Jun). v2 starts 1 Apr (day 90).
  const start = Date.UTC(2026, 0, 1);
  const span = opts.scenario === "drift" ? 179 : 60;

  const candidates: GeneratedCandidate[] = [];
  const applications: GeneratedRow[] = [];

  for (let i = 0; i < opts.size; i++) {
    const n = String(i + 1).padStart(4, "0");
    const candidateRef = `GEN-${n}`;
    const group = i % 2 === 0 ? "Group A" : "Group B"; // exact 50/50 split
    const isB = group === "Group B";

    // Candidate profile (job-relevant attributes drawn identically for both groups).
    const roles = 1 + Math.floor(rand() * 4);
    const work = Array.from({ length: roles }, (_, k) => ({ position: `${k === 0 ? "" : k === roles - 1 ? "Junior " : ""}${job.title}`.trim(), months: 6 + Math.floor(rand() * 42) }));
    const experienceMonths = work.reduce((s, w) => s + w.months, 0);
    const skillCount = 2 + Math.floor(rand() * 5);
    const skills = shuffle([...job.skills], rand).slice(0, skillCount);
    const qualification = job.quals[Math.floor(rand() * job.quals.length)];
    const gapRate = opts.scenario === "proxy_gap" ? (isB ? 0.45 : 0.1) : 0.15;
    const employmentGapMonths = rand() < gapRate ? 6 + Math.floor(rand() * 18) : 0;
    candidates.push({ candidateRef, qualification, skills, work, experienceMonths, employmentGapMonths });

    // Timing and scoring version.
    const applied = Math.floor(rand() * span);
    const version = opts.scenario === "drift" ? (applied >= 90 ? "v2" : "v1") : "v1";

    // Transparent mock ATS score.
    let score = 30 + Math.min(experienceMonths, 96) * 0.25 + skillCount * 3.5 + gaussian(rand, 0, 8);
    if (opts.scenario === "score_shift" && isB) score -= 7;
    if (opts.scenario === "proxy_gap" && employmentGapMonths > 0) score -= 9;
    if (opts.scenario === "drift" && version === "v2" && isB) score -= 9;
    score = round1(clamp(score, 0, 100));

    let cutoff = 60;
    if (opts.scenario === "selection_disparity" && isB) cutoff = 67;
    const advanced = score >= cutoff;

    const disclosed = opts.scenario === "missing_data" ? rand() >= 0.34 : rand() >= 0.03;
    const ageBand = rand() < 0.68 ? "Under 40" : "40 and over";
    const appId = `APP-${job.ref}-${n}`;

    applications.push({
      "Application ID": appId,
      "Candidate Ref": candidateRef,
      "Job Req ID": jobRef,
      "Job Title": job.title,
      Department: job.department,
      "Applied Date": day(start, applied),
      Stage: "initial_screening",
      "AI Score": score,
      Grade: grade(score),
      "Screening Decision": advanced ? "Advance" : "Reject",
      "Decision Date": day(start, applied + 2),
      "Source System": SOURCE,
      "Scoring Version": version,
      "Audit Group (synthetic)": disclosed ? group : "Not disclosed",
      "Age Band (self-reported)": ageBand,
    });

    if (advanced) {
      const assess = round1(clamp(55 + skillCount * 4 + gaussian(rand, 0, 10), 0, 100));
      applications.push({
        "Application ID": appId,
        "Candidate Ref": candidateRef,
        "Job Req ID": jobRef,
        "Job Title": job.title,
        Department: job.department,
        "Applied Date": day(start, applied),
        Stage: "assessment",
        "AI Score": assess,
        Grade: grade(assess),
        "Screening Decision": assess >= 65 ? "Advance" : "Reject",
        "Decision Date": day(start, applied + 9),
        "Source System": SOURCE,
        "Scoring Version": version,
        "Audit Group (synthetic)": disclosed ? group : "Not disclosed",
        "Age Band (self-reported)": ageBand,
      });
    }
  }

  return { format: "deeptrace-synthetic-v1", dataType: "synthetic", options: opts, candidates, applications };
}

export function datasetToCsv(ds: GeneratedDataset): string {
  return toCsv([...GENERATED_HEADERS], ds.applications.map((a) => GENERATED_HEADERS.map((h) => a[h])));
}

export function datasetToJson(ds: GeneratedDataset): string {
  return JSON.stringify(ds, null, 2);
}

export function datasetFileName(ds: GeneratedDataset, ext: "csv" | "json"): string {
  const o = ds.options;
  return `deeptrace_synthetic_${o.job}_${o.scenario}_${o.size}_seed${o.seed}.${ext}`;
}

/**
 * Convert JSON input (a generator bundle or a flat array of row objects) into
 * headers + rows so it goes through the same mapping and validation as CSV.
 */
export function jsonToTable(text: string): { headers: string[]; rows: string[][] } {
  const data = JSON.parse(text) as unknown;
  const list = Array.isArray(data) ? data : (data as { applications?: unknown })?.applications;
  if (!Array.isArray(list) || list.length === 0) throw new Error("JSON must be an array of records or a DeepTrace synthetic bundle with an 'applications' array.");
  const headers: string[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Each record must be a flat object.");
    for (const k of Object.keys(row)) if (!headers.includes(k)) headers.push(k);
  }
  const rows = list.map((row) => headers.map((h) => {
    const v = (row as Record<string, unknown>)[h];
    if (v == null) return "";
    if (typeof v === "object") throw new Error(`Field "${h}" must be a scalar value.`);
    return String(v);
  }));
  return { headers, rows };
}
