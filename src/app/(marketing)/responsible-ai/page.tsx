import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, FeatureCard, PageHero, Section } from "@/components/marketing/blocks";

export const metadata: Metadata = {
  title: "Human oversight & responsible AI",
  description: "Why AI-assisted recruitment needs human oversight, what fairness metrics can detect, and what they cannot prove.",
};

export default function ResponsibleAiPage() {
  return (
    <>
      <PageHero
        eyebrow="Responsible AI"
        title="Detecting potential risk is not the same as proving discrimination."
        intro="A practical guide for HR professionals: what fairness monitoring is good for, where it stops, and why people — not software — must make the final call."
      />
      <Section title="Why AI recruitment needs oversight">
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard icon="layers" title="Scale amplifies patterns">
            A screening rule applied to thousands of applications can repeat a small disadvantage thousands of times.
          </FeatureCard>
          <FeatureCard icon="eye" title="Patterns are not visible by default">
            Group differences only appear when someone measures them deliberately and consistently.
          </FeatureCard>
          <FeatureCard icon="shield" title="Expectations are rising">
            UK guidance and regulators emphasise transparency, monitoring and meaningful human involvement.{" "}
            <Link href="/research" className="text-brand underline">See sources</Link>.
          </FeatureCard>
        </div>
      </Section>
      <Section tone="sunken" title="What metrics can and cannot do">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h3 className="font-semibold">Fairness metrics can…</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-2">
              <li>Show that recorded outcomes differ between groups, and by how much.</li>
              <li>Say how confident we can be that a gap is not just chance.</li>
              <li>Track whether a gap persists, grows or closes over time.</li>
              <li>Point reviewers to where a closer look is warranted.</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold">Fairness metrics cannot…</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-2">
              <li>Explain why a gap exists.</li>
              <li>Prove — or rule out — unlawful discrimination.</li>
              <li>Certify a process as &ldquo;bias-free&rdquo; on the strength of one metric.</li>
              <li>Say anything reliable about groups too small to analyse.</li>
            </ul>
          </div>
        </div>
      </Section>
      <Section title="Known limits of demographic comparisons">
        <div className="grid gap-4 md:grid-cols-2">
          <FeatureCard icon="info" title="Self-reported and incomplete">
            Demographic data is optional and often missing. Non-response can differ between groups and bias results.
          </FeatureCard>
          <FeatureCard icon="users" title="Groups are not uniform">
            Broad categories hide differences within them; intersectional analysis needs much larger samples.
          </FeatureCard>
          <FeatureCard icon="compass" title="Proxy discrimination">
            Inputs such as career gaps, postcodes or particular institutions can disadvantage protected groups without ever referring to them.
          </FeatureCard>
          <FeatureCard icon="lock" title="Protected data needs safeguards">
            Special-category data requires a lawful basis, minimisation, restricted access and, typically, a DPIA. <Link href="/privacy" className="text-brand underline">Privacy</Link>.
          </FeatureCard>
        </div>
      </Section>
      <Section id="human-oversight" tone="sunken" eyebrow="Human oversight" title="People decide. DeepTrace keeps the record.">
        <ol className="grid gap-4 md:grid-cols-4">
          {[
            ["Flag", "DeepTrace raises a finding with evidence and limitations."],
            ["Assign", "A named reviewer takes ownership."],
            ["Examine", "They gather evidence: criteria, configuration, context."],
            ["Decide", "They record an outcome and rationale — resolved or inconclusive."],
          ].map(([t, d], i) => (
            <li key={t} className="card">
              <div className="tabular text-xs font-semibold text-brand">Step {i + 1}</div>
              <div className="mt-1 font-semibold">{t}</div>
              <p className="mt-1 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-3xl text-sm text-ink-2">
          DeepTrace never closes a finding on its own and never marks potential discrimination as confirmed. Every action is attributed and timestamped.
        </p>
      </Section>
      <CtaBand />
    </>
  );
}
