import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/marketing/blocks";
import { ENGINE_VERSION, METHODOLOGY_VERSION } from "@/lib/fairness/audit";

export const metadata: Metadata = {
  title: "Fairness methodology",
  description: "How DeepTrace computes selection rates, impact ratios, confidence intervals and significance tests — and what each cannot show.",
};

const METHODS = [
  ["Selection rate", "selected ÷ analysed, per group, with a Wilson score interval.", "Describes outcomes; says nothing about causes."],
  ["Impact ratio", "Group rate ÷ highest group rate, with a Katz log-method interval. Flagged below 0.8 (configurable).", "The four-fifths rule is a US-origin heuristic, not a UK legal test."],
  ["Selection difference test", "Two-sided Fisher exact test on the 2×2 table.", "With small samples, real differences can go undetected."],
  ["Score distribution", "Mean, median, IQR and histogram; Mann–Whitney U with tie and continuity correction; Cohen's d.", "Only meaningful within a single job and stage on one scoring scale."],
  ["Multiple testing", "Holm–Bonferroni across every test in an audit.", "Conservative: controls false alarms at the cost of some sensitivity."],
  ["Missing data", "Missing or withheld values are excluded and counted; flagged above 5% (medium above 20%).", "Non-response may itself differ between groups."],
  ["Suppression", "Groups below the minimum size (default 20) have counts withheld and are not compared.", "A configurable threshold, not a universal privacy guarantee."],
  ["Drift", "The same metrics per calendar period; alerts when the ratio crosses the threshold or moves by ≥ 0.10.", "Short periods give wide intervals; trends need several periods."],
  ["Counterfactual", "Matched pairs differing in one cue; mean score change with interval, decision-flip rate, exact sign test.", "Runs only against DeepTrace's mock engine unless an authorised test interface exists."],
];

export default function MethodologyPage() {
  return (
    <>
      <PageHero
        eyebrow="Fairness methodology"
        title="Every number is deterministic, tested and explained."
        intro={`Methodology ${METHODOLOGY_VERSION}, engine ${ENGINE_VERSION}. No language model computes, rounds or interprets a statistic. Results are tested against independent calculations (brute-force enumeration and published reference values).`}
      />
      <Section title="Methods">
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Method</th>
                <th>How it is computed</th>
                <th>Important limitation</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map(([m, how, lim]) => (
                <tr key={m}>
                  <td className="font-medium">{m}</td>
                  <td className="text-ink-2">{how}</td>
                  <td className="text-ink-2">{lim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section tone="sunken" title="Rules enforced in code">
        <ul className="grid gap-3 md:grid-cols-2">
          {[
            "Protected characteristics come only from self-reported, authorised fields — never inferred from names, photos or CV text.",
            "Missing demographic values are never treated as a group.",
            "One job and one stage per audit; nothing is merged implicitly.",
            "Every finding lists numerators, denominators, intervals and limitations.",
            "No result is labelled \"bias-free\"; no observed disparity is presented as proof of unlawful discrimination.",
            "Audits are reproducible: identical records and settings give identical results, checked by dataset hash.",
          ].map((r) => (
            <li key={r} className="card text-sm">
              {r}
            </li>
          ))}
        </ul>
        <h3 className="mt-10 font-semibold">Severity</h3>
        <ul className="mt-3 space-y-2 text-sm text-ink-2">
          <li>
            <strong className="text-ink">High</strong> — impact ratio below threshold and Holm-adjusted p &lt; α.
          </li>
          <li>
            <strong className="text-ink">Medium</strong> — below threshold but not significant after correction; or significant above threshold; or a significant score
            difference; or more than 20% missing.
          </li>
          <li>
            <strong className="text-ink">Low / info</strong> — modest missingness, missing scores, suppressed groups.
          </li>
        </ul>
        <p className="mt-8 text-sm">
          See also: <Link href="/responsible-ai" className="text-brand underline">what fairness metrics can and cannot prove</Link>.
        </p>
      </Section>
    </>
  );
}
