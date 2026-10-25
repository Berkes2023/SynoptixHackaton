import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { CtaBand, PageHero } from "@/components/marketing/blocks";

export const metadata: Metadata = {
  title: "Platform overview",
  description: "DeepTrace modules: ATS Data Hub, Fairness Audit Lab, Counterfactual Testing Studio, Investigations, Audit Reports and Bias Drift.",
};

const MODULES: { id: string; icon: IconName; title: string; body: string; points: string[]; app: string }[] = [
  {
    id: "data-hub",
    icon: "database",
    title: "ATS Data Hub",
    body: "Bring in screening outcomes without touching your ATS. Imports are read-only and minimised.",
    points: ["CSV and JSON import with drag-and-drop", "Column mapping to a standard schema", "Validation: duplicates, missing values, dates, scores", "Synthetic dataset generator for safe testing", "Unmapped columns dropped; sensitive fields restricted"],
    app: "/imports",
  },
  {
    id: "audit-lab",
    icon: "chart",
    title: "Fairness Audit Lab",
    body: "Deterministic group-fairness statistics for one job and one stage at a time.",
    points: ["Selection rates with Wilson intervals", "Impact ratios with Katz intervals", "Fisher exact and Mann–Whitney tests, Holm-corrected", "Missing-data reporting and small-group suppression", "Re-run and verify by dataset hash"],
    app: "/audits/new",
  },
  {
    id: "counterfactual",
    icon: "flask",
    title: "Counterfactual Testing Studio",
    body: "Matched synthetic CVs differing in exactly one job-irrelevant cue, scored by a transparent mock engine.",
    points: ["200 realistic, fully fictional CVs with varied careers", "Side-by-side CV diff of the single change", "Score-change distribution, flip rate and sign test", "Experiment history", "Adapter interface for future authorised model testing"],
    app: "/fairness-lab",
  },
  {
    id: "investigations",
    icon: "scale",
    title: "Investigation Centre",
    body: "Structured human review. People decide; DeepTrace records who, when, what and why.",
    points: ["Open, under review, more evidence required, resolved, inconclusive", "Evidence references and reviewer notes", "Required resolution rationale", "Attributed, timestamped event history", "Never auto-confirms discrimination"],
    app: "/investigations",
  },
  {
    id: "reports",
    icon: "file",
    title: "Audit Reports",
    body: "Governance-ready reports generated from stored audit records.",
    points: ["Cover page and executive summary", "Provenance: file and dataset SHA-256", "Methodology, results, charts and limitations", "Human review records and recommendations", "PDF (print) and JSON with checksum"],
    app: "/reports",
  },
  {
    id: "drift",
    icon: "trend",
    title: "Bias Drift",
    body: "Compare outcomes period by period to see whether disparities emerge, persist or close.",
    points: ["Monthly impact-ratio trends per job and stage", "Alerts when ratios cross the threshold or shift materially", "Clearly labelled synthetic time series for demonstration"],
    app: "/drift",
  },
];

export default function PlatformPage() {
  return (
    <>
      <PageHero
        eyebrow="Platform overview"
        title="An independent analysis layer for AI-assisted hiring."
        intro="DeepTrace sits beside your applicant tracking system. It reads exported outcomes, measures disparities, supports human investigation and produces reproducible evidence — without changing a single candidate decision."
        actions={
          <>
            <Link href="/demo" className="btn btn-primary btn-lg">
              Launch Interactive Demo <Icon name="arrowRight" />
            </Link>
            <Link href="/dashboard" className="btn btn-secondary btn-lg">
              Open the workspace
            </Link>
          </>
        }
      />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-16 sm:px-6">
        {MODULES.map((m) => (
          <section key={m.id} id={m.id} className="card scroll-mt-24 grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-brand-soft text-brand">
                <Icon name={m.icon} className="h-5 w-5" />
              </span>
              <h2 className="text-2xl font-semibold tracking-tight">{m.title}</h2>
              <p className="mt-2 text-ink-2">{m.body}</p>
              <Link href={m.app} className="btn btn-secondary mt-5">
                Open {m.title} <Icon name="arrowRight" />
              </Link>
            </div>
            <ul className="grid content-start gap-2 sm:grid-cols-2">
              {m.points.map((p) => (
                <li key={p} className="flex gap-2 rounded-lg border border-line bg-surface-2 p-3 text-sm">
                  <Icon name="check" className="mt-0.5 h-4 w-4 flex-none text-good" />
                  {p}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section id="architecture" className="card scroll-mt-24 p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Integration architecture</h2>
          <p className="mt-2 text-sm text-ink-2">
            Provider-neutral adapters convert each source into DeepTrace&apos;s standard screening-record schema. Today: CSV, JSON and a mock Workday-style export. Future
            enterprise integrations would use only authorised, documented interfaces with tenant-specific permissions. DeepTrace never automates submissions or
            decisions in external systems, and there is no partnership with or approved integration from Workday.
          </p>
        </section>
      </div>
      <CtaBand />
    </>
  );
}
