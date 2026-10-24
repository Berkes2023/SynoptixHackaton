import { mean, sampleSd, signTest, zForConfidence } from "./stats";
import { mulberry32 } from "../random";

/**
 * Counterfactual Lab. Runs ONLY against DeepTrace's built-in mock screening
 * engine. Testing a real screening system requires an authorised test interface.
 */
export const MOCK_ENGINE_VERSION = "mock-screener-0.3";

export interface SyntheticProfile {
  id: string;
  yearsExperience: number;
  skillsMatch: number;
  assessmentScore: number;
  employmentGap: boolean;
  postcodeRegion: "Region N" | "Region S";
  cvFormat: "single-column" | "two-column";
}

export type CounterfactualCue = "employmentGap" | "postcodeRegion" | "cvFormat";

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
};

/**
 * Deliberately imperfect mock screener: it penalises employment gaps and one
 * postcode region so the lab has something to detect. It ignores CV layout.
 */
export function mockScreeningScore(p: SyntheticProfile): number {
  let s = 20 + Math.min(p.yearsExperience, 10) * 3 + p.skillsMatch * 35 + p.assessmentScore * 0.15;
  if (p.employmentGap) s -= 6;
  if (p.postcodeRegion === "Region N") s -= 3.5;
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

function applyCue(p: SyntheticProfile, cue: CounterfactualCue, variant: boolean): SyntheticProfile {
  switch (cue) {
    case "employmentGap":
      return { ...p, employmentGap: variant };
    case "postcodeRegion":
      return { ...p, postcodeRegion: variant ? "Region N" : "Region S" };
    case "cvFormat":
      return { ...p, cvFormat: variant ? "two-column" : "single-column" };
  }
}

export function runCounterfactual(opts: { cue: CounterfactualCue; pairCount: number; seed: number; threshold: number }): CounterfactualResult {
  const rand = mulberry32(opts.seed);
  const pairs: CounterfactualPair[] = [];
  for (let i = 0; i < opts.pairCount; i++) {
    const profile: SyntheticProfile = {
      id: `SYN-${String(i + 1).padStart(3, "0")}`,
      yearsExperience: Math.floor(rand() * 12),
      skillsMatch: Math.round(rand() * 100) / 100,
      assessmentScore: Math.round(40 + rand() * 60),
      employmentGap: false,
      postcodeRegion: "Region S",
      cvFormat: "single-column",
    };
    const base = applyCue(profile, opts.cue, false);
    const variant = applyCue(profile, opts.cue, true);
    const baseScore = mockScreeningScore(base);
    const variantScore = mockScreeningScore(variant);
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
