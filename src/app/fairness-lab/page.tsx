"use client";

import { useState } from "react";
import { DeltaChart } from "@/components/charts";
import { Badge, Kv, PageHeader, fmtP, pct } from "@/components/ui";
import { CUES, MOCK_ENGINE_VERSION, runCounterfactual, type CounterfactualCue, type CounterfactualResult } from "@/lib/fairness/counterfactual";
import { useStore } from "@/lib/store";

export default function FairnessLabPage() {
  const { log } = useStore();
  const [cue, setCue] = useState<CounterfactualCue>("employmentGap");
  const [pairs, setPairs] = useState(100);
  const [seed, setSeed] = useState(42);
  const [threshold, setThreshold] = useState(60);
  const [result, setResult] = useState<CounterfactualResult | null>(null);

  function run() {
    const r = runCounterfactual({ cue, pairCount: Math.min(1000, Math.max(10, pairs)), seed, threshold });
    setResult(r);
    log("counterfactual.run", `mock-engine:${MOCK_ENGINE_VERSION}`, `${cue}; ${r.pairs.length} pairs; seed ${seed}`);
  }

  const reacts = result && result.signTestP < 0.05 && Math.abs(result.meanDelta) > 0;

  return (
    <>
      <PageHeader title="Counterfactual Lab" subtitle="Matched synthetic profiles that differ in exactly one job-irrelevant cue." />
      <div className="mb-6 rounded-lg border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-ink">
        <strong>Mock screening engine only ({MOCK_ENGINE_VERSION}).</strong> Paired tests are only run against systems where controlled test submission is
        authorised. No real ATS or vendor model is contacted. The mock engine deliberately contains biases so the method can be demonstrated.
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card">
          <fieldset>
            <legend className="label">Cue to vary</legend>
            <div className="space-y-2">
              {(Object.keys(CUES) as CounterfactualCue[]).map((k) => (
                <label key={k} className={`block cursor-pointer rounded-md border px-3 py-2 text-sm ${cue === k ? "border-brand bg-brand-soft" : "border-line bg-white"}`}>
                  <input type="radio" name="cue" className="mr-2" checked={cue === k} onChange={() => setCue(k)} />
                  <span className="font-medium">{CUES[k].label}</span>
                  <span className="mt-0.5 block text-xs text-ink-2">{CUES[k].description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="pairs">Pairs</label>
              <input id="pairs" type="number" className="input" min={10} max={1000} value={pairs} onChange={(e) => setPairs(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="seed">Seed</label>
              <input id="seed" type="number" className="input" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="thr">Pass mark</label>
              <input id="thr" type="number" className="input" min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            </div>
          </div>
          <button className="btn btn-primary mt-4 w-full" onClick={run}>
            Run experiment
          </button>
        </section>

        <section className="card lg:col-span-2">
          {!result ? (
            <p className="py-16 text-center text-sm text-ink-2">Choose a cue and run the experiment.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">
                  {CUES[result.cue].label}: {CUES[result.cue].from} → {CUES[result.cue].to}
                </h2>
                {reacts ? <Badge color="red">▲ Engine reacts to this cue</Badge> : <Badge color="green">✓ No reaction detected</Badge>}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Kv k="Mean score change" v={<span className="tabular text-lg font-semibold">{result.meanDelta.toFixed(2)}</span>} />
                <Kv k="95% CI" v={`${result.meanDeltaCi.lower.toFixed(2)} – ${result.meanDeltaCi.upper.toFixed(2)}`} />
                <Kv k="Decision flips" v={`${result.flips} of ${result.pairs.length} (${pct(result.flipRate)})`} />
                <Kv k="Sign test p" v={fmtP(result.signTestP)} />
              </dl>
              <div className="mt-4">
                <DeltaChart deltas={result.pairs} />
              </div>
              <p className="mt-2 text-xs text-ink-2">
                What can be concluded: whether <em>this tested system</em> reacts differently to the controlled change. It says nothing about the outcomes of real
                applicants.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="table tabular text-xs">
                  <thead>
                    <tr>
                      <th>Profile</th>
                      <th>Experience</th>
                      <th>Skills match</th>
                      <th>Assessment</th>
                      <th>Base score</th>
                      <th>Variant score</th>
                      <th>Δ</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.pairs.slice(0, 8).map((p) => (
                      <tr key={p.id}>
                        <td>{p.id}</td>
                        <td>{p.base.yearsExperience} yrs</td>
                        <td>{p.base.skillsMatch.toFixed(2)}</td>
                        <td>{p.base.assessmentScore}</td>
                        <td>{p.baseScore}</td>
                        <td>{p.variantScore}</td>
                        <td>{p.delta}</td>
                        <td>{p.baseAdvances === p.variantAdvances ? "same" : <span className="font-semibold text-critical">flipped</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
