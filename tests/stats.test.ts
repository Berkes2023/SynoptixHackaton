import { describe, expect, it } from "vitest";
import {
  fisherExactTwoSided,
  holmAdjust,
  mannWhitneyU,
  normalCdf,
  normalQuantile,
  ratioInterval,
  signTest,
  wilsonInterval,
} from "@/lib/fairness/stats";

/** Independent brute-force Fisher test using exact BigInt combinatorics. */
function bruteFisher(a: number, b: number, c: number, d: number): number {
  const fact = (n: number) => {
    let r = 1n;
    for (let i = 2n; i <= BigInt(n); i++) r *= i;
    return r;
  };
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  const num = fact(r1) * fact(r2) * fact(c1) * fact(n - c1);
  const prob = (x: number) => Number((num * 10n ** 30n) / (fact(n) * fact(x) * fact(r1 - x) * fact(c1 - x) * fact(r2 - c1 + x))) / 1e30;
  const obs = prob(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) if (prob(x) <= obs * (1 + 1e-7)) p += prob(x);
  return p;
}

describe("normal distribution helpers", () => {
  it("matches reference quantiles", () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.995)).toBeCloseTo(2.575829, 5);
    expect(normalQuantile(0.05)).toBeCloseTo(-1.644854, 5);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
  });
});

describe("Wilson interval", () => {
  it("reproduces published value for 40/100 at 95%", () => {
    const ci = wilsonInterval(40, 100, 0.95)!;
    expect(ci.lower).toBeCloseTo(0.3094, 4);
    expect(ci.upper).toBeCloseTo(0.498, 3);
  });
  it("handles boundaries", () => {
    expect(wilsonInterval(0, 10, 0.95)!.lower).toBe(0);
    expect(wilsonInterval(10, 10, 0.95)!.upper).toBe(1);
    expect(wilsonInterval(0, 0, 0.95)).toBeNull();
  });
});

describe("ratio interval (Katz log)", () => {
  it("brackets the point estimate and matches hand calculation", () => {
    const ci = ratioInterval(25, 100, 40, 100, 0.95)!;
    // log(0.625) ± 1.96 * sqrt(1/25 - 1/100 + 1/40 - 1/100)
    const se = Math.sqrt(1 / 25 - 1 / 100 + 1 / 40 - 1 / 100);
    expect(ci.lower).toBeCloseTo(Math.exp(Math.log(0.625) - 1.959964 * se), 6);
    expect(ci.upper).toBeCloseTo(Math.exp(Math.log(0.625) + 1.959964 * se), 6);
    expect(ci.lower).toBeLessThan(0.625);
    expect(ci.upper).toBeGreaterThan(0.625);
  });
  it("is undefined with a zero numerator", () => {
    expect(ratioInterval(0, 50, 10, 50, 0.95)).toBeNull();
  });
});

describe("Fisher exact test", () => {
  it.each([
    [25, 75, 40, 60],
    [3, 1, 1, 3],
    [10, 2, 3, 15],
    [0, 20, 5, 15],
    [12, 12, 12, 12],
  ])("agrees with brute-force enumeration for [[%i,%i],[%i,%i]]", (a, b, c, d) => {
    expect(fisherExactTwoSided(a, b, c, d)).toBeCloseTo(bruteFisher(a, b, c, d), 10);
  });
  it("matches R's fisher.test for the tea-tasting table", () => {
    expect(fisherExactTwoSided(3, 1, 1, 3)).toBeCloseTo(0.4857143, 6);
  });
});

describe("Mann–Whitney U", () => {
  it("computes U and a symmetric p-value", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [6, 7, 8, 9, 10];
    const r = mannWhitneyU(xs, ys);
    expect(r.u).toBe(0);
    expect(r.probabilityOfSuperiority).toBe(0);
    expect(mannWhitneyU(ys, xs).pValue).toBeCloseTo(r.pValue, 12);
    expect(r.pValue).toBeLessThan(0.02);
  });
  it("returns p = 1 for identical constant samples", () => {
    expect(mannWhitneyU([5, 5, 5], [5, 5, 5]).pValue).toBe(1);
  });
});

describe("Holm adjustment", () => {
  it("matches R's p.adjust(method = 'holm')", () => {
    const adj = holmAdjust([0.01, 0.04, 0.03, 0.005]);
    expect(adj).toEqual([0.03, 0.06, 0.06, 0.02].map((v) => expect.closeTo(v, 12)));
  });
});

describe("sign test", () => {
  it("is exact for small n", () => {
    expect(signTest(10, 0)).toBeCloseTo(2 / 1024, 12);
    expect(signTest(5, 5)).toBe(1);
  });
});
