"use client";

import { useMemo, useState } from "react";
import { BeforeAfterChart } from "@/components/charts";
import { Badge, fmtP, pct } from "@/components/ui";
import { CUE_GROUPS, simulateMitigation, type ArmOutcome, type GroupOutcome, type SimCue } from "@/lib/fairness/mitigation";
import { useStore } from "@/lib/store";

const CUE_ORDER: SimCue[] = ["nationality", "employmentGap", "postcodeRegion", "nameSet", "allBiased", "pronouns", "cvFormat"];
const ratio = (r: number | null) => (r == null ? "—" : r.toFixed(3));

function ArmCard({ title, arm, tone }: { title: string; arm: ArmOutcome; tone: "before" | "after" }) {
  const line = (g: GroupOutcome) => (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-ink-2">{g.group}</span>
      <span className="tabular font-medium">
        {g.selected} of {g.n} ({pct(g.rate)})
      </span>
    </div>
  );
  return (
    <div className={`rounded-xl border p-4 ${tone === "after" ? "border-green-200 bg-green-50/50 dark:bg-transparent" : "border-line bg-surface-2"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge color={arm.meetsFourFifths ? "green" : "red"}>{arm.meetsFourFifths ? "≥ 0.8 heuristic" : "below 0.8 heuristic"}</Badge>
      </div>
      <div className="mt-3 space-y-1">
        {line(arm.affected)}
        {line(arm.reference)}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-2">
        <dt>Selection-rate ratio</dt>
        <dd className="tabular text-right text-base font-semibold text-ink" data-testid={`ratio-${tone}`}>
          {ratio(arm.ratio)}
        </dd>
        <dt>Average score gap</dt>
        <dd className="tabular text-right font-semibold text-ink" data-testid={`gap-${tone}`}>
          {arm.scoreGap > 0 ? "+" : ""}
          {arm.scoreGap.toFixed(1)} pts
        </dd>
        <dt>Ratio CI</dt>
        <dd className="tabular text-right">{arm.ratioCi ? `${arm.ratioCi.lower.toFixed(2)} – ${arm.ratioCi.upper.toFixed(2)}` : "—"}</dd>
        <dt>Fisher exact p</dt>
        <dd className="tabular text-right">{fmtP(arm.fisherP)}</dd>
        <dt>Matches merit-only shortlist</dt>
        <dd className="tabular text-right">{pct(arm.meritAgreement, 0)}</dd>
        <dt>Mean skills match of shortlist</dt>
        <dd className="tabular text-right">{arm.shortlistSkills.toFixed(3)}</dd>
      </dl>
    </div>
  );
}

/**
 * Before/after view of removing a biased cue from what the screener sees.
 * Candidates are never removed: the same matched pool is shortlisted twice.
 */
export function MitigationSimulator() {
  const { log } = useStore();
  const [cue, setCue] = useState<SimCue>("nationality");
  const [poolSize, setPoolSize] = useState(400);
  const [rate, setRate] = useState(0.3);
  const [seed, setSeed] = useState(2026);
  const sim = useMemo(() => simulateMitigation({ cue, poolSize, shortlistRate: rate, seed }), [cue, poolSize, rate, seed]);
  const g = CUE_GROUPS[cue];
  const improved = sim.after.ratio != null && sim.before.ratio != null && sim.after.ratio > sim.before.ratio + 1e-9;
  const noEffect = sim.changes.newlyShortlisted === 0;
  const skillsDelta = sim.after.shortlistSkills - sim.before.shortlistSkills;
  const band = (o: GroupOutcome) => ({ group: o.group, rate: o.rate, lo: o.ci?.lower ?? o.rate, hi: o.ci?.upper ?? o.rate, n: o.n, selected: o.selected });

  return (
    <section className="card mt-6" aria-labelledby="mitigation-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="mitigation-title" className="text-sm font-semibold">
            Mitigation simulator: before vs after removing a biased cue
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            The same applicants are shortlisted twice by the mock screener: once as-is, and once with the selected cue hidden (as a redaction step would do). No candidate is
            removed, so any change comes from what the screener sees. Both groups have identical qualifications.
          </p>
        </div>
        <Badge color="amber">Synthetic simulation · {sim.engineVersion}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="mit-cue">
            Cue to remove
          </label>
          <select id="mit-cue" className="input" value={cue} onChange={(e) => setCue(e.target.value as SimCue)}>
            {CUE_ORDER.map((c) => (
              <option key={c} value={c}>
                {CUE_GROUPS[c].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mit-pool">
            Applicants
          </label>
          <select id="mit-pool" className="input" value={poolSize} onChange={(e) => setPoolSize(Number(e.target.value))}>
            {[200, 400, 1000, 2000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mit-rate">
            Shortlisted
          </label>
          <select id="mit-rate" className="input" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {[0.1, 0.2, 0.3, 0.5].map((r) => (
              <option key={r} value={r}>
                Top {r * 100}%
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mit-seed">
            Seed
          </label>
          <input id="mit-seed" className="input" type="number" min={1} max={999999} value={seed} onChange={(e) => setSeed(Math.max(1, Math.min(999999, Math.round(Number(e.target.value)) || 1)))} />
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-sunken px-4 py-3 text-sm" role="status" data-testid="mitigation-summary">
        {noEffect ? (
          <>
            <strong>No change.</strong> The mock screener never used {g.label.toLowerCase()}, so hiding it changes nothing: ratio {ratio(sim.before.ratio)} before and after.
            This is a control. Removing a cue only helps if the screener was actually using it.
          </>
        ) : (
          <>
            <strong>
              Ratio {ratio(sim.before.ratio)} → {ratio(sim.after.ratio)}
            </strong>{" "}
            for {g.affected} vs {g.reference}; average score gap {sim.before.scoreGap.toFixed(1)} → {sim.after.scoreGap.toFixed(1)} points for identical qualifications. Hiding {g.label.toLowerCase()} moved {sim.changes.newlyShortlistedAffected} equally-qualified {g.affected} applicant
            {sim.changes.newlyShortlistedAffected === 1 ? "" : "s"} onto the shortlist, displacing {sim.changes.noLongerShortlistedReference} {g.reference} applicant
            {sim.changes.noLongerShortlistedReference === 1 ? "" : "s"} who had been ranked higher only because of the cue. The shortlist size stayed at {sim.shortlistSize}.
          </>
        )}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-[1fr_1fr_1.2fr]">
        <ArmCard title={`Before: screener sees ${g.label.toLowerCase()}`} arm={sim.before} tone="before" />
        <ArmCard title="After: cue hidden from screener" arm={sim.after} tone="after" />
        <div className="rounded-xl border border-line p-3 md:col-span-2 2xl:col-span-1">
          <BeforeAfterChart
            confidence={sim.confidence}
            rows={[
              { phase: "Before", reference: band(sim.before.reference), affected: band(sim.before.affected) },
              { phase: "After", reference: band(sim.after.reference), affected: band(sim.after.affected) },
            ]}
          />
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm text-ink-2">
        {improved && sim.before.meetsFourFifths && (
          <li>
            ▲ The &ldquo;before&rdquo; ratio already passed the 0.8 heuristic, yet the screener was penalising {g.affected} applicants. Passing four-fifths is not proof
            of fairness.
          </li>
        )}
        {!noEffect && (
          <li>
            Shortlist quality (mean skills match): {sim.before.shortlistSkills.toFixed(3)} → {sim.after.shortlistSkills.toFixed(3)} (
            {skillsDelta >= 0 ? "+" : ""}
            {skillsDelta.toFixed(3)}). Reported as-is, including small decreases.
          </li>
        )}
        {sim.touchesJobRelevantField && (
          <li className="text-amber-900 dark:text-amber-200">
            ⚠ An employment gap can sometimes be job-relevant (e.g. a lapsed licence). Hiding it is a trade-off a person must decide on and document. DeepTrace does not apply it
            automatically.
          </li>
        )}
        <li>
          This simulates DeepTrace&apos;s own mock screener on fictional applicants. It shows what a mitigation <em>can</em> achieve. Historical decisions cannot be re-scored after the
          fact; to test a real employer&apos;s system, re-run it on test profiles through an authorised interface.
        </li>
      </ul>

      <div className="mt-4">
        <button
          className="btn btn-secondary"
          onClick={() =>
            log(
              "mitigation.simulated",
              `cue:${cue}`,
              `ratio ${ratio(sim.before.ratio)} → ${ratio(sim.after.ratio)}; pool ${poolSize}, top ${rate * 100}%, seed ${seed}, ${sim.engineVersion}`,
            )
          }
        >
          Record this simulation in the audit log
        </button>
      </div>
    </section>
  );
}
