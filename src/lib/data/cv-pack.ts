import { mulberry32 } from "../random";
import type { PackResume, ResumeJob } from "./resumes";

/**
 * Realistic but entirely FICTIONAL CVs for the Counterfactual Studio.
 *
 * Real applicants' CVs are never used: they are personal data, and public
 * "résumé datasets" are scraped without consent. Instead this builds
 * deterministic career histories with a realistic spread: graduates through
 * principal engineers, 1–6 roles, typical tenures and short moves between
 * jobs. Companies are invented, and there are no names, contact details or
 * locations, so the only demographic signals are the cues an experiment adds.
 */

export const CV_PACK_VERSION = "dt-cv-pack-2.0";
export const CV_PACK_SIZE = 200;
export const CV_PACK_SEED = 20261025;
/** Careers are generated backwards from this fixed date so the pack never changes. */
export const CV_PACK_AS_OF = "2026-09-01";

const FAMILIES = [
  { ladder: ["Graduate Software Engineer", "Software Engineer", "Senior Software Engineer", "Lead Software Engineer", "Principal Engineer"], area: "software" },
  { ladder: ["Junior Data Analyst", "Data Analyst", "Senior Data Analyst", "Analytics Lead", "Head of Analytics"], area: "data" },
  { ladder: ["Junior Data Engineer", "Data Engineer", "Senior Data Engineer", "Staff Data Engineer", "Principal Data Engineer"], area: "data" },
  { ladder: ["Junior DevOps Engineer", "DevOps Engineer", "Senior Site Reliability Engineer", "Staff SRE", "Head of Platform"], area: "platform" },
  { ladder: ["QA Tester", "QA Engineer", "Senior QA Engineer", "Test Lead", "Head of Quality"], area: "quality" },
] as const;

const PREFIX = ["North", "Bright", "Blue", "Harbour", "Granite", "Silver", "Oak", "Clear", "Summit", "Kestrel", "Lumen", "Copper", "Willow", "Atlas", "Quarry", "Meadow"];
const SUFFIX = ["Systems", "Labs", "Analytics", "Software", "Digital", "Logistics", "Health Tech", "Payments", "Retail Group", "Energy", "Insurance", "Media", "Mobility", "Cloud"];

const HIGHLIGHTS: Record<string, string[]> = {
  software: [
    "Built and maintained {k} customer-facing services in TypeScript and Go",
    "Cut page load time by {n}% by reworking the rendering pipeline",
    "Introduced automated testing that raised coverage from {a}% to {b}%",
    "Mentored {m} engineers and ran weekly code-review sessions",
    "Led the migration of a monolith to {k} independently deployed services",
    "Reduced production incidents by {n}% through better alerting",
  ],
  data: [
    "Designed dashboards used by {k} teams for weekly planning",
    "Automated reporting that saved roughly {h} analyst hours a month",
    "Built data pipelines processing {k} million records a day",
    "Improved forecast accuracy by {n}% with a revised model",
    "Wrote data-quality checks that caught {k} upstream issues a quarter",
    "Trained {m} colleagues in SQL and reproducible analysis",
  ],
  platform: [
    "Ran infrastructure as code for {k} production environments",
    "Brought deployment time down from {a} minutes to {c}",
    "Kept availability at 99.9% across {k} services",
    "Cut cloud spend by {n}% through right-sizing",
    "Introduced on-call runbooks adopted by {m} teams",
    "Automated certificate and secret rotation",
  ],
  quality: [
    "Built end-to-end test suites covering {k} critical user journeys",
    "Reduced escaped defects by {n}% over two releases",
    "Introduced risk-based test planning for {m} product teams",
    "Automated regression testing, cutting release checks from {a} hours to {c}",
    "Ran accessibility audits against WCAG 2.2 AA",
    "Coached developers on writing testable code",
  ],
};

const SUMMARY: Record<string, string> = {
  software: "engineer building reliable web services, with a focus on testing and maintainable code.",
  data: "data professional turning messy operational data into decisions, with strong SQL and statistics.",
  platform: "infrastructure engineer focused on reliable, observable and cost-efficient platforms.",
  quality: "quality engineer who builds automated testing into how teams ship software.",
};

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Career length in years from a realistic mixture: early, mid, senior and very senior careers. */
function careerYears(rand: () => number): number {
  const r = rand();
  if (r < 0.2) return 0.3 + rand() * 1.7;
  if (r < 0.55) return 2 + rand() * 4;
  if (r < 0.85) return 6 + rand() * 6;
  return 12 + rand() * 11;
}

function fill(template: string, rand: () => number): string {
  const a = 20 + Math.floor(rand() * 30);
  const values: Record<string, number> = {
    k: 2 + Math.floor(rand() * 18),
    n: 10 + Math.floor(rand() * 45),
    m: 2 + Math.floor(rand() * 8),
    h: 20 + Math.floor(rand() * 120),
    a,
    b: a + 25 + Math.floor(rand() * 25),
    c: 5 + Math.floor(rand() * 10),
  };
  return template.replace(/\{(\w)\}/g, (_, key: string) => String(values[key]));
}

function pick<T>(xs: readonly T[], rand: () => number): T {
  return xs[Math.floor(rand() * xs.length)];
}

export function generateCvPack(size = CV_PACK_SIZE, seed = CV_PACK_SEED): PackResume[] {
  const rand = mulberry32(seed);
  const asOf = Date.parse(CV_PACK_AS_OF + "T00:00:00Z");
  const out: PackResume[] = [];
  for (let i = 0; i < size; i++) {
    const family = pick(FAMILIES, rand);
    const target = careerYears(rand);
    // Some candidates are currently between roles (left their last job 1–8 months ago).
    let end = asOf - (rand() < 0.3 ? (30 + Math.floor(rand() * 210)) * DAY : 0);
    let remaining = target;
    const jobs: ResumeJob[] = [];
    while (remaining > 0.25 && jobs.length < 6) {
      const tenure = Math.min(remaining, 0.8 + rand() * 3.7);
      const start = end - Math.round(tenure * 365.25) * DAY;
      jobs.push({ company: `${pick(PREFIX, rand)} ${pick(SUFFIX, rand)}`, position: "", startDate: iso(start), endDate: iso(end), highlights: [] });
      remaining -= tenure;
      // A short move between jobs (2–10 weeks); not a career break.
      end = start - (14 + Math.floor(rand() * 56)) * DAY;
    }
    // Most recent role first; seniority rises with experience accumulated up to each role.
    const total = jobs.reduce((s, j) => s + (Date.parse(j.endDate) - Date.parse(j.startDate)), 0) / (365.25 * DAY);
    let before = total;
    for (const job of jobs) {
      const years = (Date.parse(job.endDate) - Date.parse(job.startDate)) / (365.25 * DAY);
      before -= years;
      const level = before + years < 1.5 ? 0 : before + years < 5 ? 1 : before + years < 10 ? 2 : before + years < 16 ? 3 : 4;
      job.position = family.ladder[level];
      const bank = [...HIGHLIGHTS[family.area]];
      const count = 2 + Math.floor(rand() * 2);
      for (let h = 0; h < count; h++) job.highlights.push(fill(bank.splice(Math.floor(rand() * bank.length), 1)[0], rand));
    }
    const yearsLabel = total < 1 ? "Early-career" : `${Math.round(total)}-year`;
    out.push({ id: `CV-${String(i + 1).padStart(3, "0")}`, summary: `${yearsLabel} ${SUMMARY[family.area]}`, work: jobs });
  }
  return out;
}
