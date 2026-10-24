import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHero, Section } from "@/components/marketing/blocks";
import { SITE } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "About DeepTrace",
  description: "Why DeepTrace exists, how it is built, and related hackathon projects.",
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Built to make AI-assisted hiring accountable."
        intro="DeepTrace started as a hackathon prototype with a simple premise: if software helps decide who gets an interview, someone independent should be able to check the outcomes — and show their working."
      />
      <Section title="What we believe">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Evidence over assertion", "Every claim on this site links to a source; every metric in the product can be reproduced."],
            ["Limits stated up front", "A fairness metric flags potential risk. It never proves or disproves discrimination."],
            ["People decide", "Software surfaces evidence. Accountable humans make and record decisions."],
          ].map(([t, d]) => (
            <div key={t} className="card">
              <div className="font-semibold">{t}</div>
              <p className="mt-2 text-sm text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section tone="sunken" title="How it is built">
        <p className="max-w-3xl text-ink-2">
          Next.js and TypeScript on Vercel, with a deterministic statistics engine covered by automated tests. The source is public on{" "}
          <a href={SITE.repo} className="text-brand underline" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          . The roadmap towards a production deployment — authentication, tenant-isolated storage, server-side reports — is listed on the{" "}
          <Link href="/security" className="text-brand underline">
            Security page
          </Link>
          .
        </p>
      </Section>
      <Section id="projects" eyebrow="Related projects" title="Other hackathon work by the same team">
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="card">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Before You Sign</h3>
              <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-2">UKFinnovator Bristol 2026</span>
            </div>
            <p className="mt-2 text-sm text-ink-2">
              A prototype that shows the real cost of loans, credit cards, overdrafts, Buy Now Pay Later, subscriptions and bills before you sign — with plain-English
              explanations, ranked risks and side-by-side comparison. Built with Next.js and TypeScript. Not financial advice.
            </p>
            <p className="mt-3 text-xs text-muted">Shared approach with DeepTrace: transparent decision support and plain-English explanations. Separate product, codebase and data.</p>
            <a href="https://github.com/Berkes2023/Fintech-Hackaton" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              View repository <Icon name="external" className="h-3.5 w-3.5" />
            </a>
          </article>
          <article className="card">
            <h3 className="font-semibold">Synoptix</h3>
            <p className="mt-2 text-sm text-ink-2">
              An earlier hackathon project. Its repository did not contain project materials we could review, so we don&apos;t describe it here rather than guess. The
              SynoptixHackaton repository currently hosts DeepTrace&apos;s source.
            </p>
            <p className="mt-3 text-xs text-muted">DeepTrace shares no backend, customers, partnership or integration with other projects.</p>
          </article>
        </div>
      </Section>
    </>
  );
}
