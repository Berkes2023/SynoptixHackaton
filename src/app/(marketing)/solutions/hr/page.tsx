import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CtaBand, FeatureCard, PageHero, Section } from "@/components/marketing/blocks";
import { DEMO_EMPLOYER, demoAudit } from "@/lib/site/demo-data";

export const metadata: Metadata = {
  title: "For HR teams",
  description: "Independent auditing of AI-assisted recruitment outcomes for HR leaders: detect disparities, investigate them and document human review.",
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function HrSolutionsPage() {
  const screening = demoAudit();
  const assessment = demoAudit({ stage: "assessment" });
  const analyst = demoAudit({ jobRef: "REQ-1077", stage: "assessment" });
  const s = screening.comparisons[0];
  const sg = screening.groups.find((g) => g.group === s.group)!;
  const sr = screening.groups.find((g) => g.group === s.reference)!;
  const a = assessment.comparisons[0];

  return (
    <>
      <PageHero
        eyebrow="Solutions · HR teams"
        title="You invested in smarter recruitment. Now make it more accountable."
        intro="DeepTrace gives HR leaders an independent, evidence-based view of how AI-assisted screening outcomes differ between groups — and a structured way to investigate, decide and document."
        actions={
          <>
            <Link href="/demo" className="btn btn-primary btn-lg">
              Launch Interactive Demo <Icon name="arrowRight" />
            </Link>
            <Link href="/contact" className="btn btn-secondary btn-lg">
              Contact us
            </Link>
          </>
        }
      />

      <Section eyebrow="The challenge" title="What HR teams tell us is hard.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["users", "High application volumes", "Thousands of applications per role make manual fairness review impractical."],
            ["eye", "Limited visibility", "Screening disparities are invisible unless someone deliberately looks for them."],
            ["layers", "Hidden proxy effects", "Inputs like career gaps or location can disadvantage groups indirectly."],
            ["scale", "Hard to investigate", "AI-assisted outcomes are difficult to unpick without structured evidence."],
            ["folder", "Fragmented records", "Reviews live in emails and spreadsheets, not an auditable trail."],
            ["briefcase", "Inconsistent reviews", "Different requisitions get different levels of scrutiny."],
            ["shield", "Rising expectations", "Regulators and governance boards expect monitoring and human oversight."],
            ["info", "Candidate trust", "Applicants increasingly question automated screening."],
          ].map(([icon, t, d]) => (
            <FeatureCard key={t} icon={icon as never} title={t}>
              {d}
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section tone="sunken" eyebrow="How DeepTrace helps" title="From outcomes data to documented decisions.">
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["Analyse", "Import the screening outcomes your ATS already records — no model access needed."],
            ["Detect", "Flag group disparities using impact ratios, confidence intervals and significance tests."],
            ["Investigate", "Assign a reviewer, gather evidence and record a reasoned outcome."],
            ["Track", "Compare periods and stages to see whether disparities persist."],
            ["Document", "Every action is attributed and timestamped."],
            ["Reproduce", "Re-run any audit and get identical numbers, verified by dataset hash."],
            ["Report", "Generate governance-ready reports with methodology and limitations."],
            ["Govern", "Give AI governance committees consistent evidence across roles."],
          ].map(([t, d], i) => (
            <li key={t} className="card">
              <div className="tabular text-xs font-semibold text-brand">0{i + 1}</div>
              <div className="mt-1 font-semibold">{t}</div>
              <p className="mt-1 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="case-study"
        eyebrow="Fictional case study"
        title={`${DEMO_EMPLOYER.name}: one requisition, three stages of evidence`}
        intro={
          <>
            {DEMO_EMPLOYER.name} is {DEMO_EMPLOYER.note}. Every figure below is computed live by DeepTrace&apos;s engine from its synthetic dataset — nothing is typed in
            by hand.
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card">
            <div className="eyebrow">1 · Initial screening</div>
            <p className="mt-3 text-sm">
              Software Engineer (REQ-1042): <strong>{sg.selected} of {sg.n}</strong> {s.group.toLowerCase()} applicants advanced ({pct(sg.selectionRate!)}) versus{" "}
              <strong>{sr.selected} of {sr.n}</strong> {s.reference.toLowerCase()} applicants ({pct(sr.selectionRate!)}).
            </p>
            <dl className="tabular mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">Impact ratio</dt>
              <dd className="font-semibold">{s.ratio!.toFixed(3)}</dd>
              <dt className="text-muted">95% CI</dt>
              <dd>{s.ratioCi!.lower.toFixed(2)}–{s.ratioCi!.upper.toFixed(2)}</dd>
              <dt className="text-muted">Holm-adjusted p</dt>
              <dd>{s.adjustedP.toFixed(3)}</dd>
            </dl>
            <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">
              Below the 0.8 heuristic → investigation recommended.{" "}
              {s.adjustedP < screening.config.alpha
                ? "The gap remains statistically significant after correcting for multiple tests — still evidence of a disparity, not of its cause."
                : "After correcting for multiple tests the evidence is not conclusive, and DeepTrace says so."}
            </p>
          </div>
          <div className="card">
            <div className="eyebrow">2 · Assessment stage</div>
            <p className="mt-3 text-sm">
              Of those who advanced, the assessment stage shows an impact ratio of <strong className="tabular">{a?.ratio?.toFixed(3) ?? "—"}</strong> (
              {assessment.sample.analysed} candidates).
            </p>
            <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">
              The disparity appears at screening, not assessment — so the investigation focuses on screening criteria and configuration.
            </p>
          </div>
          <div className="card">
            <div className="eyebrow">3 · A different role</div>
            <p className="mt-3 text-sm">
              Data Analyst (REQ-1077): <strong className="tabular">{analyst.sample.missingAttribute} of {analyst.sample.scopedRecords}</strong> applicants (
              {pct(analyst.sample.missingAttributeRate)}) did not disclose gender.
            </p>
            <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">
              DeepTrace reports insufficient data rather than guessing, and raises a data-quality finding about how equal-opportunities data is collected.
            </p>
          </div>
        </div>
        <p className="mt-6 text-sm text-ink-2">
          Outcome in the demo: a named reviewer records that the screening criteria need review, then generates a report with provenance and limitations. DeepTrace
          does not claim savings or guarantee that discrimination is prevented — it makes the evidence and the decisions visible.
        </p>
      </Section>

      <Section tone="sunken" eyebrow="Multi-agent auditing" title="Independent checks before anything reaches your desk.">
        <p className="max-w-3xl text-ink-2">
          Specialised agents validate the data, look for disparities, test sensitivity to irrelevant cues, and independently re-verify every figure. Then a named reviewer
          approves the findings before any report is produced. Disagreements between agents are shown, not hidden.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/technology/multi-agent-ai" className="btn btn-secondary">
            See how it works <Icon name="arrowRight" />
          </Link>
          <Link href="/agents" className="btn btn-ghost">
            Open the Agent Observatory
          </Link>
        </div>
      </Section>

      <CtaBand title="Walk through this case study yourself." body="Run the audit, open the investigation and generate the report in the guided demo." />
    </>
  );
}
