import { mean, sampleSd, signTest, zForConfidence } from "./stats";
import { mulberry32 } from "../random";

/**
 * Counterfactual Lab. Runs ONLY against DeepTrace's built-in mock screening
 * engine. Testing a real screening system requires an authorised test interface.
 */
export const MOCK_ENGINE_VERSION = "mock-screener-0.4";

export interface SyntheticProfile {
  id: string;
  yearsExperience: number;
  skillsMatch: number;
  assessmentScore: number;
  employmentGap: boolean;
  postcodeRegion: "Region N" | "Region S";
  cvFormat: "single-column" | "two-column";
  /** Gender-related cue shown on the CV (fictional). */
  pronouns: "he/him" | "she/her";
  /** Nationality statement. Distinct from citizenship, ethnicity and right to work. */
  nationality: "UK national" | "Non-UK national";
  /** Held constant in every experiment: right to work is a legitimate, separate question. */
  rightToWork: "Yes";
  /** One of two pre-registered FICTIONAL name sets. Never used to infer anyone's identity. */
  nameSet: "Name set A" | "Name set B";
}

export type CounterfactualCue =
  | "employmentGap"
  | "postcodeRegion"
  | "cvFormat"
  | "pronouns"
  | "nationality"
  | "nameSet"
  | "pronounsXnationality";

/** Fields a mitigation strategy may hide from the scorer. */
export type MaskableField = "employmentGap" | "postcodeRegion" | "pronouns" | "nationality" | "nameSet" | "cvFormat";

export const NEUTRAL_PROFILE: Omit<SyntheticProfile, "id" | "yearsExperience" | "skillsMatch" | "assessmentScore"> = {
  employmentGap: false,
  postcodeRegion: "Region S",
  cvFormat: "single-column",
  pronouns: "he/him",
  nationality: "UK national",
  rightToWork: "Yes",
  nameSet: "Name set A",
};

export const CUES: Record<CounterfactualCue, { label: string; description: string; from: string; to: string }> = {
  employmentGap: {
    label: "Employment gap",
    description: "A 12-month career gap — can act as a proxy for caring responsibilities, disability or pregnancy.",
    from: "No gap",
    to: "12-month gap",
  },
  postcodeRegion: {
    label: "Postcode region",
    description: "Home region — can act as a proxy for ethnicity or socio-economic background.",
    from: "Region S",
    to: "Region N",
  },
  cvFormat: {
    label: "CV layout (control)",
    description: "Single- vs two-column CV layout. Job-irrelevant control cue; a well-behaved screener should not react.",
    from: "Single-column",
    to: "Two-column",
  },
  pronouns: {
    label: "Gender-related cue (pronouns)",
    description: "A pronouns line on the CV. Tests sensitivity to a gender signal on fictional CVs — not anyone's actual gender.",
    from: "he/him",
    to: "she/her",
  },
  nationality: {
    label: "Nationality statement",
    description: "UK vs non-UK national. Right to work is held at \"Yes\" in both CVs: nationality, citizenship, ethnicity and right to work are different things.",
    from: "UK national",
    to: "Non-UK national",
  },
  nameSet: {
    label: "Name variation (fictional sets)",
    description: "Two pre-registered fictional name sets. A correspondence-test cue; no protected characteristic is inferred from any name.",
    from: "Name set A",
    to: "Name set B",
  },
  pronounsXnationality: {
    label: "Intersectional: pronouns × nationality",
    description: "Secondary experiment changing two cues together. Compare against each single-cue result before drawing conclusions.",
    from: "he/him · UK national",
    to: "she/her · Non-UK national",
  },
};

/**
 * Deliberately imperfect mock screener: it penalises employment gaps, one
 * postcode region, the non-UK nationality statement and fictional name set B so
 * the lab has something to detect. It ignores CV layout and pronouns.
 * Masked fields are hidden from the scorer (as a redaction step would do).
 */
export function mockScreeningScore(p: SyntheticProfile, mask: readonly MaskableField[] = []): number {
  const hidden = new Set(mask);
  let s = 20 + Math.min(p.yearsExperience, 10) * 3 + p.skillsMatch * 35 + p.assessmentScore * 0.15;
  if (p.employmentGap && !hidden.has("employmentGap")) s -= 6;
  if (p.postcodeRegion === "Region N" && !hidden.has("postcodeRegion")) s -= 3.5;
  if (p.nationality === "Non-UK national" && !hidden.has("nationality")) s -= 4;
  if (p.nameSet === "Name set B" && !hidden.has("nameSet")) s -= 2.5;
  return Math.round(Math.max(0, Math.min(100, s)) * 10) / 10;
}

export interface CounterfactualPair {
  id: string;
  base: SyntheticProfile;
  baseScore: number;
  variantScore: number;
  delta: number;
  baseAdvances: boolean;
  variantAdvances: boolean;
}

export interface CounterfactualResult {
  engineVersion: string;
  cue: CounterfactualCue;
  seed: number;
  threshold: number;
  pairs: CounterfactualPair[];
  meanDelta: number;
  sdDelta: number;
  meanDeltaCi: { lower: number; upper: number };
  flips: number;
  flipRate: number;
  signTestP: number;
}

export function applyCue(p: SyntheticProfile, cue: CounterfactualCue, variant: boolean): SyntheticProfile {
  switch (cue) {
    case "employmentGap":
      return { ...p, employmentGap: variant };
    case "postcodeRegion":
      return { ...p, postcodeRegion: variant ? "Region N" : "Region S" };
    case "cvFormat":
      return { ...p, cvFormat: variant ? "two-column" : "single-column" };
    case "pronouns":
      return { ...p, pronouns: variant ? "she/her" : "he/him" };
    case "nationality":
      return { ...p, nationality: variant ? "Non-UK national" : "UK national" };
    case "nameSet":
      return { ...p, nameSet: variant ? "Name set B" : "Name set A" };
    case "pronounsXnationality":
      return applyCue(applyCue(p, "pronouns", variant), "nationality", variant);
  }
}

/** A base profile taken from an existing synthetic CV (e.g. the résumé pack). */
export interface CounterfactualBase {
  id: string;
  yearsExperience: number;
}

/**
 * Without `bases`, profiles are fully generated. With `bases`, each pair starts
 * from one CV (experience comes from its work history; skills match and
 * assessment score, which a CV does not carry, are seeded), at most one pair per CV.
 */
export function runCounterfactual(opts: {
  cue: CounterfactualCue;
  pairCount: number;
  seed: number;
  threshold: number;
  bases?: CounterfactualBase[];
  /** Fields hidden from the scorer (mitigation experiments). Profiles themselves are unchanged. */
  mask?: readonly MaskableField[];
}): CounterfactualResult {
  const rand = mulberry32(opts.seed);
  const pairs: CounterfactualPair[] = [];
  const count = opts.bases ? Math.min(opts.pairCount, opts.bases.length) : opts.pairCount;
  const offset = opts.bases ? Math.abs(Math.trunc(opts.seed)) % opts.bases.length : 0;
  for (let i = 0; i < count; i++) {
    const source = opts.bases?.[(offset + i) % opts.bases.length];
    const generatedYears = Math.floor(rand() * 12);
    const profile: SyntheticProfile = {
      id: source?.id ?? `SYN-${String(i + 1).padStart(3, "0")}`,
      yearsExperience: source?.yearsExperience ?? generatedYears,
      skillsMatch: Math.round(rand() * 100) / 100,
      assessmentScore: Math.round(40 + rand() * 60),
      ...NEUTRAL_PROFILE,
    };
    const base = applyCue(profile, opts.cue, false);
    const variant = applyCue(profile, opts.cue, true);
    const baseScore = mockScreeningScore(base, opts.mask);
    const variantScore = mockScreeningScore(variant, opts.mask);
    pairs.push({
      id: profile.id,
      base,
      baseScore,
      variantScore,
      delta: Math.round((variantScore - baseScore) * 10) / 10,
      baseAdvances: baseScore >= opts.threshold,
      variantAdvances: variantScore >= opts.threshold,
    });
  }
  const deltas = pairs.map((p) => p.delta);
  const m = mean(deltas);
  const sd = sampleSd(deltas);
  const half = (zForConfidence(0.95) * sd) / Math.sqrt(deltas.length);
  const flips = pairs.filter((p) => p.baseAdvances !== p.variantAdvances).length;
  return {
    engineVersion: MOCK_ENGINE_VERSION,
    cue: opts.cue,
    seed: opts.seed,
    threshold: opts.threshold,
    pairs,
    meanDelta: m,
    sdDelta: sd,
    meanDeltaCi: { lower: m - half, upper: m + half },
    flips,
    flipRate: flips / pairs.length,
    signTestP: signTest(deltas.filter((d) => d > 0).length, deltas.filter((d) => d < 0).length),
  };
}
