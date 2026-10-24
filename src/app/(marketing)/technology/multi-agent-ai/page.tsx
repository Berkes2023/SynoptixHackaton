import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AgentDemo } from "@/components/marketing/AgentDemo";
import { AgentDiagram } from "@/components/marketing/AgentDiagram";
import { CtaBand, FeatureCard, PageHero, Section } from "@/components/marketing/blocks";
import { AGENTS } from "@/lib/agents/agents";
import { AGENT_TYPES } from "@/lib/agents/contracts";
import { REQUIRED_EVIDENCE, runEvaluation } from "@/lib/agents/evaluation";

export const metadata: Metadata = {
  title: "Multi-agent auditing",
  description: "How DeepTrace coordinates specialised, bounded auditing agents with deterministic verification and human approval — and how it compares with a deterministic baseline.",
};

const SCENARIO_LABEL: Record<string, string> = {
  balanced: "Balanced (no disparity)",
  selection_disparity: "Selection disparity",
  score_shift: "Score shift",
  proxy_gap: "Proxy (employment gap)",
  missing_data: "Missing data",
};

export default async function MultiAgentPage() {
  const rows = await runEvaluation();
  const total = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);

  return (
    <>
      <PageHero
        eyebrow="Technology · Multi-agent auditing"
        title="One recruitment system. Multiple independent perspectives."
        intro="DeepTrace coordinates specialised auditing agents to examine recruitment outcomes, test potential sources of unfairness, verify evidence and support human review."
        actions={
          <>
            <Link href="#demo" className="btn btn-primary btn-lg">
              Launch multi-agent demo <Icon name="arrowRight" />
            </Link>
            <Link href="/agents" className="btn btn-secondary btn-lg">
              Open Agent Observatory
            </Link>
          </>
        }
      />

      <Section
        eyebrow="Implementation status"
        title="What is real today"
        intro="All eight agents are implemented and tested — as deterministic services, not language-model personas. No agent calls an AI model in this release, so there are no model costs. A model-provider abstraction exists for future optional reasoning, disabled by default."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AGENT_TYPES.map((a) => (
            <div key={a} className="rounded-xl border border-line bg-surface p-4 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Icon name="check" className="h-4 w-4 text-good" />
                {AGENTS[a].name}
              </div>
              <div className="mt-1 text-xs text-ink-2">Deterministic · v{AGENTS[a].version}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Workflow state persists in your workspace (browser). A durable server-side worker and database persistence are planned; until then nothing runs as an unbounded serverless job.
        </p>
      </Section>

      <Section tone="sunken" eyebrow="How it works" title="A bounded orchestrator, eight specialised roles">
        <AgentDiagram />
        <ol className="mt-8 grid gap-3 text-sm md:grid-cols-4">
          {["CREATED → VALIDATING", "PLANNING → ANALYSING → EXPERIMENTING", "VERIFYING → AWAITING_REVIEW", "REPORTING → COMPLETED"].map((s, i) => (
            <li key={s} className="rounded-lg border border-line bg-surface p-3">
              <div className="tabular text-xs font-semibold text-brand">Stage {i + 1}</div>
              <div className="mt-1 font-mono text-xs">{s}</div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-ink-2">
          Every transition is validated against an allow-list and logged. Tasks have typed contracts, Zod-validated outputs, timeouts, retry limits, idempotent re-execution and a hard task
          cap — agents cannot spawn tasks of their own.
        </p>
      </Section>

      <Section eyebrow="Why independent verification matters" title="Proposals are not findings.">
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard icon="search" title="Discovery proposes">
            The Bias Discovery agent deliberately casts a wide net and passes every candidate disparity on as a hypothesis.
          </FeatureCard>
          <FeatureCard icon="scale" title="Verification decides">
            A separate agent recounts from raw data, recomputes every figure and applies multiple-testing correction. Mismatched or unsupported claims are rejected.
          </FeatureCard>
          <FeatureCard icon="compass" title="Conflicts are shown">
            When agents disagree, the interface shows both positions and which rule settled it: verified statistics, then hard policy, then human review.
          </FeatureCard>
        </div>
      </Section>

      <Section tone="sunken" eyebrow="Autonomous auditing ≠ automated hiring" title="The agents may examine. They may never decide.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h3 className="font-semibold">The orchestrator may…</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              <li>Choose among predefined, authorised tests for the data and objective.</li>
              <li>Run repeated experiments on DeepTrace&apos;s mock engine.</li>
              <li>Propose mitigation trials for human review.</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold">It may never…</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              <li>Access an external ATS, or alter, reject or rank candidates.</li>
              <li>Modify original records or imported scores.</li>
              <li>Send data to an external AI provider.</li>
              <li>Skip or approve its own human review gate.</li>
            </ul>
          </div>
        </div>
        <div className="mt-6 card">
          <h3 className="font-semibold">Human approval checkpoints</h3>
          <ul className="mt-3 grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
            <li>Releasing findings and generating a report — <strong className="text-ink">enforced today</strong></li>
            <li>Testing an external live recruitment system — denied in this deployment</li>
            <li>Sending data to an external AI provider — denied in this deployment</li>
            <li>Applying a mitigation to a real process — never automatic; recommendation only</li>
          </ul>
          <p className="mt-3 text-xs text-muted">Approvals record reviewer, decision, timestamp, rationale and evidence references. The person who started an audit cannot approve it.</p>
        </div>
      </Section>

      <Section id="demo" eyebrow="Try it" title="A real workflow on synthetic data">
        <AgentDemo />
      </Section>

      <Section
        id="evaluation"
        tone="sunken"
        eyebrow="Measured, not assumed"
        title="Multi-agent workflow vs a deterministic baseline"
        intro="Identical synthetic cases (500 candidates each) through both approaches. These numbers are produced by running both arms when this page is built."
      >
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="table tabular min-w-[860px] text-sm">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Expected</th>
                <th>Baseline correct</th>
                <th>Multi-agent correct</th>
                <th>Evidence items (of {REQUIRED_EVIDENCE.length})</th>
                <th>Hypotheses not verified</th>
                <th>Unsupported claims</th>
                <th>Runtime (baseline / multi)</th>
                <th>Recovered from injected failure</th>
                <th>Corrupted claim caught</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.scenario}>
                  <td className="font-medium">{SCENARIO_LABEL[r.scenario]}</td>
                  <td>{r.disparityExpected ? "Disparity" : "None"}</td>
                  <td>{r.baseline.correct ? "✓" : "✗"}</td>
                  <td>{r.multiAgent.correct ? "✓" : "✗"}</td>
                  <td>
                    {r.baseline.evidencePresent.length} / {r.multiAgent.evidencePresent.length}
                  </td>
                  <td>{r.multiAgent.rejectedHypotheses}</td>
                  <td>
                    {r.baseline.unsupportedClaims} / {r.multiAgent.unsupportedClaims}
                  </td>
                  <td>
                    {r.baseline.runtimeMs.toFixed(1)} / {r.multiAgent.runtimeMs.toFixed(0)} ms
                  </td>
                  <td>{r.multiAgent.recoveredFromInjectedFailure ? "✓ (retry)" : "✗"}</td>
                  <td>{r.multiAgent.corruptedClaimCaught == null ? "n/a (no claims)" : r.multiAgent.corruptedClaimCaught ? "✓ rejected" : "✗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="card text-sm">
            <div className="font-semibold">Correctness</div>
            <p className="mt-1 text-ink-2">
              Baseline {rows.filter((r) => r.baseline.correct).length}/{rows.length}, multi-agent {rows.filter((r) => r.multiAgent.correct).length}/{rows.length}. Both use the same
              deterministic statistics, so equal detection is expected — the agents do not make the maths more accurate.
            </p>
          </div>
          <div className="card text-sm">
            <div className="font-semibold">What the agents add</div>
            <p className="mt-1 text-ink-2">
              Data-quality checks, independent recomputation, counterfactual and mitigation evidence, conflict records and an approval trail: {rows[0].multiAgent.evidencePresent.length} vs{" "}
              {rows[0].baseline.evidencePresent.length} evidence items. On clean data verification held back {total((r) => r.multiAgent.rejectedHypotheses)} hypotheses — its measured value is catching corrupted upstream claims ({rows.filter((r) => r.multiAgent.corruptedClaimCaught).length} of {rows.filter((r) => r.multiAgent.corruptedClaimCaught != null).length} caught), which the baseline has no mechanism for.
            </p>
          </div>
          <div className="card text-sm">
            <div className="font-semibold">What it costs</div>
            <p className="mt-1 text-ink-2">
              Roughly {Math.round(total((r) => r.multiAgent.runtimeMs) / Math.max(0.1, total((r) => r.baseline.runtimeMs)))}× the runtime of the baseline (still well under a second per case).
              Model cost: $0 — no model calls.
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-ink-2">
          <strong className="text-ink">Single general-purpose AI agent:</strong> not run. It requires a model provider, which is not configured, and we do not simulate its results. Runtime
          figures were measured on the build server and vary between runs.
        </p>
      </Section>

      <Section id="differentiation" eyebrow="Positioning" title="We don't build another AI recruiter. We build the systems that audit them.">
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="table min-w-[720px] text-sm">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Typical purpose</th>
                <th className="text-brand">DeepTrace&apos;s role alongside it</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["CV ranking engines", "Score and order candidates", "Examines whether recorded outcomes differ between groups and how scoring reacts to controlled cues"],
                ["Applicant tracking systems", "Run the hiring workflow", "Read-only auditing of exported outcomes; never changes the process"],
                ["Generic LLM CV analysers", "Summarise or judge individual CVs", "Deterministic statistics and verified evidence; no LLM computes or interprets a metric"],
                ["Standalone analytics dashboards", "Describe pipeline metrics", "Adds verification, experiments, human-governed review and reproducible audit trails"],
              ].map(([t, p, d]) => (
                <tr key={t}>
                  <td className="font-medium">{t}</td>
                  <td className="text-ink-2">{p}</td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Many of these products include their own fairness or explainability features. DeepTrace is designed as an independent layer, not a replacement.</p>
      </Section>

      <Section tone="sunken" eyebrow="Safeguards" title="Security and privacy built into the workflow">
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard icon="lock" title="Least-privilege data access">
            Agents receive references, not datasets. A broker gives each role only its permitted view; Explainability and Reporting never see records.
          </FeatureCard>
          <FeatureCard icon="shield" title="Deterministic policy">
            Authorisation, tenancy and approval rules are code. The Governance agent can explain a denial, never override it.
          </FeatureCard>
          <FeatureCard icon="file" title="Immutable evidence">
            Originals and imported scores are never modified; every result is versioned and exportable with its full execution history.
          </FeatureCard>
        </div>
      </Section>

      <CtaBand title="See the agents work on your synthetic data." body="Start a workflow in the Agent Observatory, step through each task and approve the findings yourself." />
    </>
  );
}
