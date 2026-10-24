import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/blocks";
import { ResearchLibrary } from "@/components/marketing/ResearchLibrary";

export const metadata: Metadata = {
  title: "Research & evidence",
  description: "Sourced research on recruitment discrimination, candidate trust in AI screening, AI recruitment regulation and audit methodology.",
};

export default function ResearchPage() {
  return (
    <>
      <PageHero
        eyebrow="Research & evidence"
        title="The evidence behind independent recruitment auditing."
        intro="Published studies, surveys, regulation and guidance — each with its source, date, scope and limitations. These are third-party findings, kept separate from claims about DeepTrace itself."
      />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <ResearchLibrary />
        <p className="mt-8 rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
          <strong className="text-ink">How to read this page.</strong> Survey findings describe self-reported perceptions or experiences, not legally established
          discrimination. None of these sources measured DeepTrace, Workday or any specific vendor&apos;s AI unless stated. Sources were checked against the original
          publications in October 2026.
        </p>
      </div>
    </>
  );
}
