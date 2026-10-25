import { MOCK_ENGINE_VERSION, NEUTRAL_PROFILE, mockScreeningScore, type MaskableField, type SyntheticProfile } from "./counterfactual";
import { fisherExactTwoSided, ratioInterval, wilsonInterval } from "./stats";
import type { Interval } from "./types";
import { mulberry32 } from "../random";

/**
 * Mitigation simulator: what happens to shortlisting outcomes when the
 * screener stops seeing a biased cue?
 *
 * It builds a synthetic applicant pool where both groups have the SAME
 * distribution of job-relevant qualifications, shortlists the top candidates
 * with DeepTrace's mock screener, then shortlists the same pool again with the
 * cue masked. No candidate is removed: mitigation changes what the screener
 * sees, never who is counted. Results describe the mock screener only; a real
 * employer's tool would have to be re-run through an authorised test interface.
 */

export const MITIGATION_SIM_VERSION = "mitigation-sim-1.0";

/** Group labels per cue: [reference group (cue absent), affected group (cue present)]. */
export const CUE_GROUPS: Record<MaskableField, { reference: string; affected: string; label: string }> = {
  employmentGap: { label: "Employment gap", reference: "No gap", affected: "12-month gap" },
  postcodeRegion: { label: "Postcode region", reference: "Region S", affected: "Region N" },
  nationality: { label: "Nationality statement", reference: "UK national", affected: "Non-UK national" },
  nameSet: { label: "Name variation (fictional sets)", reference: "Name set A", affected: "Name set B" },
  pronouns: { label: "Gender-related cue (pronouns)", reference: "he/him", affected: "she/her" },
  cvFormat: { label: "CV layout (control)", reference: "Single-column", affected: "Two-column" },
};

/** Masking these can hide information an employer may legitimately consider; a person must decide. */
export const JOB_RELEVANT_CUES: readonly MaskableField[] = ["employmentGap"];

const ALL_CUES = Object.keys(CUE_GROUPS) as MaskableField[];

export interface GroupOutcome {
  group: string;
  n: number;
  selected: number;
  rate: number;
  ci: Interval | null;
}

export interface ArmOutcome {
  reference: GroupOutcome;
  affected: GroupOutcome;
  /** Affected-group rate ÷ reference-group rate. */
  ratio: number | null;
  ratioCi: Interval | null;
  fisherP: number;
  /** Ratio at or above the 0.8 screening heuristic. Not a legal test. */
  meetsFourFifths: boolean;
  /** Mean job-relevant skills match of the shortlisted candidates (0–1). */
  shortlistSkills: number;
  /** Share of the shortlist that a job-relevant-only ranking (every cue masked) would also pick. */
  meritAgreement: number;
}

export interface MitigationSimulation {
  version: string;
  engineVersion: string;
  cue: MaskableField;
  seed: number;
  poolSize: number;
  shortlistSize: number;
  confidence: number;
  before: ArmOutcome;
  after: ArmOutcome;
  /** Candidates whose shortlisting decision changed when the cue was masked. */
  changes: { newlyShortlisted: number; noLongerShortlisted: number; newlyShortlistedAffected: number; noLongerShortlistedReference: number };
  touchesJobRelevantField: boolean;
}

function pool(cue: MaskableField, size: number, seed: number): SyntheticProfile[] {
  const rand = mulberry32(seed);
  const out: SyntheticProfile[] = [];
  // Matched pool: every qualification profile appears once in each group, so any
  // difference in outcomes is caused by the cue, not by chance differences in merit.
  for (let i = 0; i < size / 2; i++) {
    const qualifications = { yearsExperience: Math.floor(rand() * 16), skillsMatch: Math.round(rand() * 100) / 100, assessmentScore: Math.round(rand() * 100) };
    for (const affected of [false, true]) {
      const n = out.length + 1;
      out.push({ ...NEUTRAL_PROFILE, ...qualifications, id: `SIM-${String(n).padStart(4, "0")}`, ...(affected ? affectedValue(cue) : {}) });
    }
  }
  return out;
}

function affectedValue(cue: MaskableField): Partial<SyntheticProfile> {
  switch (cue) {
    case "employmentGap":
      return { employmentGap: true };
    case "postcodeRegion":
      return { postcodeRegion: "Region N" };
    case "nationality":
      return { nationality: "Non-UK national" };
    case "nameSet":
      return { nameSet: "Name set B" };
    case "pronouns":
      return { pronouns: "she/her" };
    case "cvFormat":
      return { cvFormat: "two-column" };
  }
}

/** Top-k by score; ties broken by id so the result is fully deterministic. */
function shortlist(profiles: SyntheticProfile[], k: number, mask: readonly MaskableField[]): Set<string> {
  return new Set(
    profiles
      .map((p) => ({ id: p.id, s: mockScreeningScore(p, mask) }))
      .sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))
      .slice(0, k)
      .map((x) => x.id),
  );
}

function outcome(group: string, members: SyntheticProfile[], chosen: Set<string>, confidence: number): GroupOutcome {
  const selected = members.filter((p) => chosen.has(p.id)).length;
  return { group, n: members.length, selected, rate: members.length ? selected / members.length : 0, ci: wilsonInterval(selected, members.length, confidence) };
}

function arm(profiles: SyntheticProfile[], isAffected: (p: SyntheticProfile) => boolean, chosen: Set<string>, merit: Set<string>, cue: MaskableField, confidence: number): ArmOutcome {
  const g = CUE_GROUPS[cue];
  const ref = outcome(g.reference, profiles.filter((p) => !isAffected(p)), chosen, confidence);
  const aff = outcome(g.affected, profiles.filter(isAffected), chosen, confidence);
  const ratio = ref.rate > 0 ? aff.rate / ref.rate : null;
  const picked = profiles.filter((p) => chosen.has(p.id));
  return {
    reference: ref,
    affected: aff,
    ratio,
    ratioCi: ratioInterval(aff.selected, aff.n, ref.selected, ref.n, confidence),
    fisherP: fisherExactTwoSided(aff.selected, aff.n - aff.selected, ref.selected, ref.n - ref.selected),
    meetsFourFifths: ratio != null && ratio >= 0.8,
    shortlistSkills: picked.length ? picked.reduce((s, p) => s + p.skillsMatch, 0) / picked.length : 0,
    meritAgreement: chosen.size ? [...chosen].filter((id) => merit.has(id)).length / chosen.size : 0,
  };
}

export function simulateMitigation(opts: { cue: MaskableField; poolSize?: number; shortlistRate?: number; seed?: number; confidence?: number }): MitigationSimulation {
  const { cue, poolSize = 400, shortlistRate = 0.3, seed = 2026, confidence = 0.95 } = opts;
  if (poolSize < 20 || poolSize > 5000 || poolSize % 2) throw new RangeError("poolSize must be an even number between 20 and 5000");
  if (!(shortlistRate > 0 && shortlistRate < 1)) throw new RangeError("shortlistRate must be between 0 and 1");
  const profiles = pool(cue, poolSize, seed);
  const k = Math.round(poolSize * shortlistRate);
  const affectedIds = new Set(profiles.filter((_, i) => i % 2 === 1).map((p) => p.id));
  const isAffected = (p: SyntheticProfile) => affectedIds.has(p.id);
  const before = shortlist(profiles, k, []);
  const after = shortlist(profiles, k, [cue]);
  const merit = shortlist(profiles, k, ALL_CUES);
  const added = [...after].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !after.has(id));
  return {
    version: MITIGATION_SIM_VERSION,
    engineVersion: MOCK_ENGINE_VERSION,
    cue,
    seed,
    poolSize,
    shortlistSize: k,
    confidence,
    before: arm(profiles, isAffected, before, merit, cue, confidence),
    after: arm(profiles, isAffected, after, merit, cue, confidence),
    changes: {
      newlyShortlisted: added.length,
      noLongerShortlisted: removed.length,
      newlyShortlistedAffected: added.filter((id) => affectedIds.has(id)).length,
      noLongerShortlistedReference: removed.filter((id) => !affectedIds.has(id)).length,
    },
    touchesJobRelevantField: JOB_RELEVANT_CUES.includes(cue),
  };
}
