import type { Interval, ScoreSummary } from "./types";

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x)));
}

/** Inverse standard normal CDF (Acklam's algorithm, relative error < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError("p must be in (0, 1)");
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const tail = (q: number) =>
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < low) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - low) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

export function zForConfidence(confidence: number): number {
  return normalQuantile(1 - (1 - confidence) / 2);
}

/** Wilson score interval for a binomial proportion. */
export function wilsonInterval(x: number, n: number, confidence: number): Interval | null {
  if (n <= 0) return null;
  const z = zForConfidence(confidence);
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) };
}

/**
 * Interval for the ratio of two proportions (x1/n1) / (x2/n2) using the
 * Katz log method. Undefined when either numerator is zero.
 */
export function ratioInterval(x1: number, n1: number, x2: number, n2: number, confidence: number): Interval | null {
  if (x1 <= 0 || x2 <= 0 || n1 <= 0 || n2 <= 0) return null;
  const z = zForConfidence(confidence);
  const logRatio = Math.log(x1 / n1 / (x2 / n2));
  const se = Math.sqrt(1 / x1 - 1 / n1 + 1 / x2 - 1 / n2);
  return { lower: Math.exp(logRatio - z * se), upper: Math.exp(logRatio + z * se) };
}

function logFactorials(n: number): Float64Array {
  const out = new Float64Array(n + 1);
  for (let i = 2; i <= n; i++) out[i] = out[i - 1] + Math.log(i);
  return out;
}

/**
 * Two-sided Fisher exact test for the 2x2 table [[a, b], [c, d]].
 * Sums probabilities of all tables at least as extreme as observed
 * (same convention as R's fisher.test).
 */
export function fisherExactTwoSided(a: number, b: number, c: number, d: number): number {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  const lf = logFactorials(n);
  const logP = (x: number) =>
    lf[r1] + lf[r2] + lf[c1] + lf[n - c1] - lf[n] - lf[x] - lf[r1 - x] - lf[c1 - x] - lf[r2 - c1 + x];
  const observed = Math.exp(logP(a));
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const px = Math.exp(logP(x));
    if (px <= observed * (1 + 1e-7)) p += px;
  }
  return Math.min(1, p);
}

/** Mann–Whitney U test, normal approximation with tie and continuity correction. */
export function mannWhitneyU(xs: number[], ys: number[]): { u: number; z: number; pValue: number; probabilityOfSuperiority: number } {
  const n1 = xs.length;
  const n2 = ys.length;
  const all = [...xs.map((v) => ({ v, g: 0 })), ...ys.map((v) => ({ v, g: 1 }))].sort((p, q) => p.v - q.v);
  const N = all.length;
  let rankSum1 = 0;
  let tieTerm = 0;
  let i = 0;
  while (i < N) {
    let j = i;
    while (j + 1 < N && all[j + 1].v === all[i].v) j++;
    const avgRank = (i + j + 2) / 2;
    const t = j - i + 1;
    if (t > 1) tieTerm += t * t * t - t;
    for (let k = i; k <= j; k++) if (all[k].g === 0) rankSum1 += avgRank;
    i = j + 1;
  }
  const u = rankSum1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieTerm / (N * (N - 1))));
  if (sigma === 0) return { u, z: 0, pValue: 1, probabilityOfSuperiority: 0.5 };
  const diff = u - mu;
  const z = (diff - 0.5 * Math.sign(diff)) / sigma;
  const pValue = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  return { u, z, pValue, probabilityOfSuperiority: u / (n1 * n2) };
}

/** Holm–Bonferroni step-down adjustment. Returns adjusted p-values in input order. */
export function holmAdjust(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, idx) => ({ p, idx })).sort((x, y) => x.p - y.p || x.idx - y.idx);
  const adjusted = new Array<number>(m);
  let running = 0;
  order.forEach(({ p, idx }, k) => {
    running = Math.max(running, Math.min(1, (m - k) * p));
    adjusted[idx] = running;
  });
  return adjusted;
}

export function mean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

export function sampleSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

/** Quantile with linear interpolation (Hyndman–Fan type 7). */
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarise(xs: number[]): ScoreSummary {
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    n: xs.length,
    mean: mean(xs),
    sd: sampleSd(xs),
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
  };
}

export function cohensD(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || ys.length < 2) return null;
  const pooled = Math.sqrt(
    ((xs.length - 1) * sampleSd(xs) ** 2 + (ys.length - 1) * sampleSd(ys) ** 2) / (xs.length + ys.length - 2),
  );
  return pooled === 0 ? null : (mean(xs) - mean(ys)) / pooled;
}

/** Exact two-sided binomial sign test against p = 0.5. */
export function signTest(positives: number, negatives: number): number {
  const n = positives + negatives;
  if (n === 0) return 1;
  const k = Math.min(positives, negatives);
  const lf = logFactorials(n);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(lf[n] - lf[i] - lf[n - i] - n * Math.LN2);
  return Math.min(1, 2 * tail);
}
