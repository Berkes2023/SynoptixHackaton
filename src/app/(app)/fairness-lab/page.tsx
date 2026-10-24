"use client";

import { useState } from "react";
import { DeltaChart } from "@/components/charts";
import { ResumeDiff } from "@/components/ResumeDiff";
import { Badge, Kv, PageHeader, fmtP, pct } from "@/components/ui";
import { RESUME_PACK, RESUME_PACK_SOURCE, yearsOfExperience } from "@/lib/data/resumes";
import {
  CUES,
  MOCK_ENGINE_VERSION,
  applyCue,
  runCounterfactual,
  type CounterfactualCue,
  type CounterfactualResult,
} from "@/lib/fairness/counterfactual";
import { newId, useStore } from "@/lib/store";
import { fmtDate } from "@/components/ui";

type Source = "resumes" | "generated";
const BASES = RESUME_PACK.map((r) => ({ id: r.id, yearsExperience: yearsOfExperience(r) }));

export default function FairnessLabPage() {
  const { state, update, log, user } = useStore();
  const [source, setSource] = useState<Source>("resumes");
  const [cue, setCue] = useState<CounterfactualCue>("employmentGap");
  const [pairs, setPairs] = useState(60);
  const [seed, setSeed] = useState(42);
  const [threshold, setThreshold] = useState(60);
  const [result, setResult] = useState<CounterfactualResult | null>(null);
  const [resultSource, setResultSource] = useState<Source>("resumes");
  const [selected, setSelected] = useState<string | null>(null);

  const maxPairs = source === "resumes" ? RESUME_PACK.length : 1000;

  function run() {
    const r = runCounterfactual({
      cue,
      pairCount: Math.min(maxPairs, Math.max(10, pairs)),
      seed,
      threshold,
      bases: source === "resumes" ? BASES : undefined,
    });
    setResult(r);
    setResultSource(source);
    // Open the diff on the first pair whose decision flipped, if any — that is the most telling example.
    setSelected((r.pairs.find((p) => p.baseAdvances !== p.variantAdvances) ?? r.pairs[0]).id);
    const exp = {
      id: newId("exp"),
      at: new Date().toISOString(),
      by: user.name,
      cue,
      source,
      pairs: r.pairs.length,
      seed,
      meanDelta: r.meanDelta,
      flips: r.flips,
      signTestP: r.signTestP,
    };
    update((s) => ({ ...s, experiments: [...s.experiments, exp].slice(-50) }));
    log("counterfactual.run", `mock-engine:${MOCK_ENGINE_VERSION}`, `${cue}; ${r.pairs.length} pairs; ${source}; seed ${seed}`);
  }

  const reacts = result && result.signTestP < 0.05 && Math.abs(result.meanDelta) > 0;
  const pair = result?.pairs.find((p) => p.id === selected);
  const resume = pair && resultSource === "resumes" ? RESUME_PACK.find((r) => r.id === pair.id) : undefined;

  return (
    <>
      <PageHeader title="Counterfactual Testing Studio" subtitle="Matched synthetic CVs: identical job-relevant inputs, exactly one cue changed." />
      <div className="mb-6 rounded-lg border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-ink">
        <strong>Mock screening engine only ({MOCK_ENGINE_VERSION}).</strong> Paired tests are only run against systems where controlled test submission is
        authorised. No real ATS or vendor model is contacted. The mock engine deliberately contains biases so the method can be demonstrated.
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card">
          <fieldset>
            <legend className="label">Base profiles</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["resumes", `Résumé pack (${RESUME_PACK.length} CVs)`],
                  ["generated", "Generated numbers"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className={`cursor-pointer rounded-md border px-3 py-2 text-xs font-medium ${source === k ? "border-brand bg-brand-soft" : "border-line bg-white"}`}>
                  <input
                    type="radio"
                    name="source"
                    className="mr-1.5"
                    checked={source === k}
                    onChange={() => {
                      setSource(k);
                      if (k === "resumes") setPairs((n) => Math.min(n, RESUME_PACK.length));
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
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
              <input id="pairs" type="number" className="input" min={10} max={maxPairs} value={pairs} onChange={(e) => setPairs(Number(e.target.value))} />
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
          {source === "resumes" && (
            <p className="mt-3 text-xs text-ink-2">
              CVs are machine-generated by{" "}
              <a className="text-brand underline" href={RESUME_PACK_SOURCE.url} target="_blank" rel="noreferrer">
                {RESUME_PACK_SOURCE.name}
              </a>{" "}
              ({RESUME_PACK_SOURCE.licence}). Names, contact details, locations, references and interests are removed. Experience comes from each CV&apos;s work
              history; skills match and assessment score are seeded.
            </p>
          )}
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
              <div className="mt-4 max-h-72 overflow-auto">
                <table className="table tabular text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      <th>Profile</th>
                      <th>Experience</th>
                      <th>Skills match</th>
                      <th>Assessment</th>
                      <th>Base</th>
                      <th>Variant</th>
                      <th>Δ</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.pairs.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(p.id)}
                        className={`cursor-pointer ${p.id === selected ? "bg-brand-soft" : "hover:bg-plane"}`}
                        aria-selected={p.id === selected}
                      >
                        <td className="font-medium text-brand underline-offset-2 hover:underline">{p.id}</td>
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

      {pair && resume && result && (
        <section className="card mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              CV diff — {pair.id} · {CUES[result.cue].label}
            </h2>
            <span className="tabular text-xs text-ink-2">
              Score change {pair.delta > 0 ? "+" : ""}
              {pair.delta} · {pair.baseAdvances === pair.variantAdvances ? "same decision" : "decision flipped"} · pass mark {result.threshold}
            </span>
          </div>
          <ResumeDiff
            resume={resume}
            base={pair.base}
            variant={applyCue(pair.base, result.cue, true)}
            baseScore={pair.baseScore}
            variantScore={pair.variantScore}
            threshold={result.threshold}
          />
          <p className="mt-3 text-xs text-ink-2">Highlighted lines are the only difference between the two CVs. Select another row above to compare a different pair.</p>
          <div className="mt-5 overflow-x-auto">
            <div className="label">Inputs to the mock scorer</div>
            <table className="table tabular text-sm">
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Base</th>
                  <th>Variant</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const v = applyCue(pair.base, result.cue, true);
                  const rows: [string, string | number, string | number][] = [
                    ["Years of experience (job-relevant)", pair.base.yearsExperience, v.yearsExperience],
                    ["Skills match (job-relevant)", pair.base.skillsMatch.toFixed(2), v.skillsMatch.toFixed(2)],
                    ["Assessment score (job-relevant)", pair.base.assessmentScore, v.assessmentScore],
                    ["Employment gap", pair.base.employmentGap ? "12 months" : "None", v.employmentGap ? "12 months" : "None"],
                    ["Postcode region", pair.base.postcodeRegion, v.postcodeRegion],
                    ["CV layout", pair.base.cvFormat, v.cvFormat],
                    ["Pronouns", pair.base.pronouns, v.pronouns],
                    ["Nationality statement", pair.base.nationality, v.nationality],
                    ["Right to work in the UK (always held constant)", pair.base.rightToWork, v.rightToWork],
                    ["Fictional name set", pair.base.nameSet, v.nameSet],
                  ];
                  return rows.map(([k, a, b]) => (
                    <tr key={k} className={a !== b ? "bg-amber-50" : ""}>
                      <td>{k}</td>
                      <td>{a}</td>
                      <td className={a !== b ? "font-semibold" : ""}>
                        {b}
                        {a !== b && <span className="ml-2 text-xs text-amber-900">changed</span>}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-sm font-semibold">Transparent mock scorer ({MOCK_ENGINE_VERSION})</h2>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-sunken p-3 text-xs leading-relaxed">
            {`score = 20
      + 3 × min(years, 10)
      + 35 × skills_match
      + 0.15 × assessment
      − 6    if employment gap      ← injected bias
      − 3.5  if Region N            ← injected bias
      − 4    if Non-UK national     ← injected bias
      − 2.5  if fictional name set B ← injected bias
      (CV layout, pronouns ignored)  ← controls`}
          </pre>
          <p className="mt-2 text-xs text-ink-2">
            This is DeepTrace&apos;s own demonstration engine — not Workday&apos;s or any vendor&apos;s algorithm. Testing a real system requires an authorised test interface (see the
            adapter design in <code>src/lib/adapters</code>).
          </p>
        </section>
        <section className="card">
          <h2 className="text-sm font-semibold">Experiment history ({state.experiments.length})</h2>
          {state.experiments.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">Runs you perform appear here.</p>
          ) : (
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="table tabular text-xs">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Cue</th>
                    <th>Pairs</th>
                    <th>Mean Δ</th>
                    <th>Flips</th>
                    <th>p</th>
                  </tr>
                </thead>
                <tbody>
                  {[...state.experiments].reverse().map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap">{fmtDate(e.at)}</td>
                      <td>{CUES[e.cue as CounterfactualCue]?.label ?? e.cue}</td>
                      <td>{e.pairs}</td>
                      <td>{e.meanDelta.toFixed(2)}</td>
                      <td>{e.flips}</td>
                      <td>{fmtP(e.signTestP)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
