import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { CtaBand, FeatureCard, PageHero, Section } from "@/components/marketing/blocks";

interface Persona {
  title: string;
  eyebrow: string;
  headline: string;
  intro: string;
  needs: [IconName, string, string][];
  modules: { href: string; label: string }[];
}

const PERSONAS: Record<string, Persona> = {
  "recruitment-managers": {
    title: "For recruitment managers",
    eyebrow: "Solutions · Recruitment managers",
    headline: "Know how each requisition is screening — stage by stage.",
    intro: "See selection rates and score distributions per job and stage, spot where a funnel narrows unevenly, and hand concerns to a reviewer with the evidence attached.",
    needs: [
      ["briefcase", "Per-requisition view", "Stage summaries and audits scoped to one job, never silently merged."],
      ["chart", "Stage comparisons", "Separate analyses for screening, assessment and later stages."],
      ["scale", "Clean hand-off", "Open an investigation from a finding with the evidence already attached."],
    ],
    modules: [
      { href: "/platform#audit-lab", label: "Fairness Audit Lab" },
      { href: "/platform#data-hub", label: "ATS Data Hub" },
    ],
  },
  compliance: {
    title: "For compliance officers",
    eyebrow: "Solutions · Compliance",
    headline: "Evidence you can reproduce, explain and file.",
    intro: "Every audit records its dataset hash, configuration and methodology version. Every review action is attributed. Reports state limitations alongside results.",
    needs: [
      ["shield", "Reproducibility", "Re-run any audit and verify identical metrics against the stored dataset hash."],
      ["file", "Report-ready", "Provenance, methodology, findings, limitations and sign-off in one document."],
      ["users", "Attributable review", "Who looked, when, what they concluded and why."],
    ],
    modules: [
      { href: "/platform#reports", label: "Audit Reports" },
      { href: "/platform#investigations", label: "Investigations" },
    ],
  },
  "ai-governance": {
    title: "For AI governance teams",
    eyebrow: "Solutions · AI governance",
    headline: "Monitor screening behaviour, not just model documentation.",
    intro: "Compare outcomes across periods and scoring versions, test sensitivity to job-irrelevant cues in a controlled studio, and keep humans in the decision loop.",
    needs: [
      ["trend", "Drift monitoring", "Track impact ratios over time and flag meaningful changes."],
      ["flask", "Counterfactual testing", "Matched synthetic CVs that differ in one controlled cue."],
      ["compass", "Clear limits", "Every finding states what cannot be concluded."],
    ],
    modules: [
      { href: "/platform#counterfactual", label: "Counterfactual Testing Studio" },
      { href: "/methodology", label: "Fairness methodology" },
    ],
  },
  enterprise: {
    title: "For enterprise organisations",
    eyebrow: "Solutions · Enterprise",
    headline: "One fairness methodology across every department and ATS.",
    intro: "A provider-neutral adapter model means the same analysis applies whichever ATS each business unit uses — with read-only access and role-based controls.",
    needs: [
      ["building", "Consistency", "The same statistical rules for every department and region."],
      ["database", "Provider-neutral", "CSV, JSON and Workday-style exports through one adapter interface."],
      ["lock", "Role separation", "Group-level results without exposing raw sensitive attributes."],
    ],
    modules: [
      { href: "/security", label: "Security overview" },
      { href: "/platform", label: "Platform overview" },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(PERSONAS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = PERSONAS[(await params).slug];
  return p ? { title: p.title, description: p.intro } : {};
}

export default async function PersonaPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = PERSONAS[(await params).slug];
  if (!p) notFound();
  return (
    <>
      <PageHero
        eyebrow={p.eyebrow}
        title={p.headline}
        intro={p.intro}
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
      <Section eyebrow="What you get" title="Built around your responsibilities.">
        <div className="grid gap-4 md:grid-cols-3">
          {p.needs.map(([icon, t, d]) => (
            <FeatureCard key={t} icon={icon} title={t}>
              {d}
            </FeatureCard>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          {p.modules.map((m) => (
            <Link key={m.href} href={m.href} className="btn btn-secondary">
              {m.label} <Icon name="arrowRight" />
            </Link>
          ))}
          <Link href="/solutions/hr#case-study" className="btn btn-ghost">
            See the worked case study
          </Link>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
