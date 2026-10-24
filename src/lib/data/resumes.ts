import pack from "./resume-pack.json";
import type { SyntheticProfile } from "../fairness/counterfactual";

/**
 * 60 machine-generated résumés from jsonresume-fake (Unlicense), stored in a
 * subset of the JSON Resume schema. Names, contact details, photos, websites,
 * locations, references and interests were removed when the pack was built:
 * the lab varies one cue at a time and must not carry other demographic signals.
 */
export interface ResumeJob {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  highlights: string[];
}

export interface PackResume {
  id: string;
  summary: string;
  work: ResumeJob[];
}

export const RESUME_PACK = pack as PackResume[];

export const RESUME_PACK_SOURCE = {
  name: "jsonresume-fake",
  url: "https://github.com/jsonresume/jsonresume-fake",
  licence: "Unlicense (public domain)",
};

const MS_PER_YEAR = 365.25 * 86400000;

/** Total years in listed roles, rounded to one decimal. */
export function yearsOfExperience(r: PackResume): number {
  const total = r.work.reduce((s, w) => s + (Date.parse(w.endDate) - Date.parse(w.startDate)), 0);
  return Math.round((total / MS_PER_YEAR) * 10) / 10;
}

const month = (iso: string) => iso.slice(0, 7);

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export interface ResumeLine {
  section: "meta" | "summary" | "work";
  text: string;
  emphasis?: boolean;
}

/**
 * Render a pack résumé as the CV the mock screener "sees", with the profile's
 * cue values applied. Used for the side-by-side diff.
 */
export function renderResume(r: PackResume, p: SyntheticProfile): ResumeLine[] {
  const lines: ResumeLine[] = [
    { section: "meta", text: `Name: fictional placeholder from ${p.nameSet}` },
    { section: "meta", text: `Pronouns: ${p.pronouns}` },
    { section: "meta", text: `Nationality: ${p.nationality}` },
    { section: "meta", text: `Right to work in the UK: ${p.rightToWork}` },
    { section: "meta", text: `Location: ${p.postcodeRegion === "Region N" ? "Northfield (Region N)" : "Southbridge (Region S)"}` },
    { section: "meta", text: `Layout: ${p.cvFormat === "two-column" ? "Two-column" : "Single-column"}` },
  ];
  if (r.summary) lines.push({ section: "summary", text: r.summary });
  r.work.forEach((w, i) => {
    if (i === 0 && p.employmentGap) {
      // Gap after the most recent role: total experience is unchanged, so only the cue differs.
      lines.push({ section: "work", text: `Career break · ${month(w.endDate)} – ${month(addMonths(w.endDate, 12))} (12 months)`, emphasis: true });
    }
    lines.push({ section: "work", text: `${w.position} — ${w.company} · ${month(w.startDate)} – ${month(w.endDate)}`, emphasis: true });
    for (const h of w.highlights) lines.push({ section: "work", text: `• ${h}` });
  });
  return lines;
}

/** Line-level diff: which lines exist only in the base or only in the variant. */
export function diffResumes(base: ResumeLine[], variant: ResumeLine[]) {
  const baseSet = new Set(base.map((l) => l.text));
  const variantSet = new Set(variant.map((l) => l.text));
  return {
    removed: new Set(base.filter((l) => !variantSet.has(l.text)).map((l) => l.text)),
    added: new Set(variant.filter((l) => !baseSet.has(l.text)).map((l) => l.text)),
  };
}
