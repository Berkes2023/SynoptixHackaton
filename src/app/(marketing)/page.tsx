import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CtaBand, FeatureCard, Section, StatCard } from "@/components/marketing/blocks";
import { MiniAudit } from "@/components/marketing/MiniAudit";
import { SITE } from "@/lib/site/config";
import { DEMO_EMPLOYER, demoAudit } from "@/lib/site/demo-data";
import { HEADLINE_STATS } from "@/lib/site/research";

const FAQ = [
  {
    q: "Does DeepTrace decide whether discrimination happened?",
    a: "No. DeepTrace measures and documents disparities in recorded outcomes and supports human investigation. Whether unlawful discrimination occurred is a legal question that statistics alone cannot answer.",
  },
  {
    q: "Do we need access to our ATS vendor's AI model?",
    a: "No. Observational audits use the scores, grades and decisions your ATS already records, exported by an authorised user. Counterfactual testing of a live model would require an approved test interface; today it runs only against DeepTrace's mock engine.",
  },
  {
    q: "Does DeepTrace change candidate outcomes?",
    a: "Never. It is read-only with respect to external systems. It does not reject candidates, alter scores or submit anything to your ATS.",
  },
  {
    q: "Where do demographic attributes come from?",
    a: "Only from self-reported fields an organisation is authorised to analyse. DeepTrace never infers gender, ethnicity or any protected characteristic from names, photos or CV text. Missing values are reported, not guessed.",
  },
  {
    q: "Is DeepTrace integrated with Workday?",
    a: "No. There is no partnership or approved integration. The demo uses a fictional Workday-style export format. Future integrations would use authorised, documented interfaces only.",
  },
  {
    q: "Is this production-ready?",
    a: "Not yet. DeepTrace is a prototype: the demo runs on synthetic data, and production prerequisites such as SSO, tenant-isolated storage and a DPIA are listed honestly on our Security page.",
  },
];

export default function HomePage() {
  const audit = demoAudit();
  const cmp = audit.comparisons[0];
  const ref = audit.groups.find((g) => g.group === cmp.reference)!;
  const grp = audit.groups.find((g) => g.group === cmp.group)!;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: SITE.name,
            applicationCategory: "BusinessApplication",
            description: SITE.description,
            url: SITE.url,
            offers: { "@type": "Offer", price: "0", priceCurrency: "GBP", description: "Public interactive demo" },
          }),
        }}
      />

      {/* 1. Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-28">
          <div className="animate-in">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-good" /> Independent AI recruitment fairness auditing
            </div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Your recruitment AI makes decisions. Who audits them?</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
              DeepTrace helps organisations independently examine AI-assisted recruitment outcomes, identify potential fairness risks, investigate disparities and
              document decisions with evidence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/demo" className="btn btn-primary btn-lg">
                Launch Interactive Demo <Icon name="arrowRight" />
              </Link>
              <Link href="#how-it-works" className="btn btn-secondary btn-lg">
                See How It Works
              </Link>
            </div>
            <p className="mt-6 text-xs text-muted">No sign-up. The demo uses fictional candidates and a mock screening engine.</p>
          </div>

          <div className="animate-in card self-center p-0 [animation-delay:120ms]" aria-label="Example finding from the demo">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <span className="text-xs font-medium text-ink-2">Software Engineer · Initial screening</span>
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">▲ Investigation recommended</span>
            </div>
            <div className="space-y-4 p-5">
              {[grp, ref].map((g) => (
                <div key={g.group}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{g.group}</span>
                    <span className="tabular text-ink-2">
                      {g.selected} of {g.n} advanced · <strong className="text-ink">{(g.selectionRate! * 100).toFixed(0)}%</strong>
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${g.selectionRate! * 100 * 2}%` }} />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
                <div>
                  <div className="tabular text-xl font-semibold">{cmp.ratio!.toFixed(3)}</div>
                  <div className="text-[11px] text-muted">impact ratio</div>
                </div>
                <div>
                  <div className="tabular text-xl font-semibold">{cmp.adjustedP.toFixed(3)}</div>
                  <div className="text-[11px] text-muted">Holm-adjusted p</div>
                </div>
                <div>
                  <div className="tabular text-xl font-semibold">{audit.sample.scopedRecords}</div>
                  <div className="text-[11px] text-muted">applicants</div>
                </div>
              </div>
              <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">
                Computed live by DeepTrace&apos;s engine on {DEMO_EMPLOYER.name}, {DEMO_EMPLOYER.note}. A disparity worth investigating — not proof of discrimination.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problem */}
      <Section
        id="problem"
        eyebrow="The problem"
        title="Screening decisions now happen at a scale no one reviews by hand."
        intro="AI-assisted tools grade, rank and filter thousands of applicants. When outcomes differ between groups, most organisations cannot easily see it, explain it or show what they did about it."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard icon="eye" title="Limited visibility">
            Disparities between groups hide inside high application volumes, multiple requisitions and multiple screening stages.
          </FeatureCard>
          <FeatureCard icon="layers" title="Hidden proxies">
            Neutral-looking inputs such as career gaps or postcode can act as proxies for protected characteristics.
          </FeatureCard>
          <FeatureCard icon="file" title="Fragmented records">
            When questions arise, evidence of what was checked, by whom and with what result is often scattered or missing.
          </FeatureCard>
        </div>
      </Section>

      {/* 3. Numbers */}
      <Section
        id="numbers"
        tone="sunken"
        eyebrow="The problem in numbers"
        title="People already doubt fair treatment in hiring."
        intro={
          <>
            Published, sourced findings. Survey figures describe self-reported perceptions and experiences — not legally established discrimination — and none of
            them measured any particular vendor&apos;s AI.{" "}
            <Link href="/research" className="text-brand underline">
              See the full evidence library
            </Link>
            .
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HEADLINE_STATS.map((e) => (
            <StatCard key={e.id} entry={e} />
          ))}
        </div>
      </Section>

      {/* 4. Why independent */}
      <Section
        id="why"
        eyebrow="Why independent auditing matters"
        title="Your ATS manages recruitment. DeepTrace audits its outcomes."
        intro="Regulators and guidance increasingly expect organisations to monitor AI-assisted hiring for fairness and keep humans meaningfully involved. An independent analysis layer makes that monitoring repeatable and evidenced."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard icon="compass" title="Separation of duties">
            The system that scores candidates should not be the only system that checks its own outcomes.
          </FeatureCard>
          <FeatureCard icon="gauge" title="Consistent across tools">
            One methodology applied to every requisition, stage and source system, so results are comparable over time.
          </FeatureCard>
          <FeatureCard icon="shield" title="Defensible evidence">
            Each result records its dataset hash, settings and methodology version, and can be reproduced exactly.
          </FeatureCard>
        </div>
      </Section>

      {/* 5. What it does */}
      <Section id="what" tone="sunken" eyebrow="What DeepTrace does" title="Five modules, one evidence trail.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard icon="database" title="ATS Data Hub">
            Read-only CSV and JSON imports with field mapping, validation and data minimisation.
          </FeatureCard>
          <FeatureCard icon="chart" title="Fairness Audit Lab">
            Selection rates, impact ratios, score distributions, confidence intervals and significance tests — with sample sizes shown.
          </FeatureCard>
          <FeatureCard icon="flask" title="Counterfactual Testing Studio">
            Matched synthetic CVs that differ in one cue, tested against a transparent mock screener.
          </FeatureCard>
          <FeatureCard icon="scale" title="Investigation Centre">
            Assign findings, record reviewer notes and rationale, and keep an attributable history.
          </FeatureCard>
          <FeatureCard icon="file" title="Audit Reports">
            Executive-ready reports with provenance, methodology, findings, limitations and human sign-off.
          </FeatureCard>
          <FeatureCard icon="trend" title="Bias drift">
            Compare periods to see whether disparities are emerging, persisting or closing.
          </FeatureCard>
        </div>
      </Section>

      {/* 6. How it works */}
      <Section id="how-it-works" eyebrow="How it works" title="From export to signed-off report.">
        <ol className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[
            ["Import", "Upload an approved ATS export. Map columns; unmapped fields are dropped."],
            ["Validate", "Duplicates, missing values and bad dates are flagged before anything is stored."],
            ["Audit", "Choose a job, stage and authorised category. Statistics run deterministically."],
            ["Explain", "Each finding states what was measured, why it triggered and what it can't show."],
            ["Investigate", "A named reviewer records evidence, rationale and an outcome."],
            ["Report", "Generate a reproducible report with provenance and limitations."],
          ].map(([t, d], i) => (
            <li key={t} className="card">
              <div className="tabular mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-semibold text-on-brand">{i + 1}</div>
              <div className="font-semibold">{t}</div>
              <p className="mt-1 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 7. Interactive */}
      <Section
        id="try"
        tone="sunken"
        eyebrow="Try it now"
        title="A real calculation, right here."
        intro="Pick a requisition and a self-reported category. The same deterministic engine that powers the product runs in your browser on fictional data."
      >
        <MiniAudit />
      </Section>

      {/* 8. Different */}
      <Section id="different" eyebrow="What makes DeepTrace different" title="An independent analysis layer, not another ATS.">
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th />
                <th>Applicant tracking system</th>
                <th>Recruitment scoring system</th>
                <th className="text-brand">Independent auditing (DeepTrace)</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Primary purpose", "Manage requisitions, candidates and workflow", "Rank or grade candidates", "Examine recorded outcomes for disparities"],
                ["Changes outcomes?", "Yes — it runs the process", "Yes — it informs decisions", "No — read-only"],
                ["Key output", "Hiring pipeline", "Scores and grades", "Reproducible evidence, findings and reports"],
                ["Human review", "Of candidates", "Of recommendations", "Of fairness findings, with attributable rationale"],
              ].map(([k, ...v]) => (
                <tr key={k}>
                  <td className="font-medium">{k}</td>
                  {v.map((x, i) => (
                    <td key={i} className={i === 2 ? "font-medium" : "text-ink-2"}>
                      {x}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Many ATS and scoring vendors offer their own fairness features. DeepTrace complements them with an independent, provider-neutral view.</p>
        <div className="mt-8 flex flex-col gap-4 rounded-xl border border-brand/30 bg-brand-soft p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-semibold">We don&apos;t build another AI recruiter. We build the systems that audit them.</div>
            <p className="mt-1 text-sm text-ink-2">Eight bounded, deterministic auditing agents — with independent verification and a human approval gate.</p>
          </div>
          <Link href="/technology/multi-agent-ai" className="btn btn-primary shrink-0">
            How multi-agent auditing works <Icon name="arrowRight" />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Reproducible", "Same data and settings, same numbers — verified by dataset hash."],
            ["Statistical evidence", "Confidence intervals, exact tests and multiple-testing correction."],
            ["Cross-stage", "Compare screening, assessment and later stages separately."],
            ["Provenance", "Every number traces back to a file hash and an import."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-line p-4">
              <div className="flex items-center gap-2 font-medium">
                <Icon name="check" className="h-4 w-4 text-good" /> {t}
              </div>
              <p className="mt-1 text-sm text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 9. HR benefits */}
      <Section id="hr" tone="sunken" eyebrow="For HR teams" title="Accountability without a data-science team.">
        <div className="grid gap-6 lg:grid-cols-2">
          <ul className="space-y-3">
            {[
              "Plain-English findings: what was measured, why it matters, what it can't prove.",
              "One consistent review process for every requisition.",
              "A documented trail for governance committees and auditors.",
              "Earlier visibility of screening disparities, before they compound across stages.",
            ].map((b) => (
              <li key={b} className="flex gap-3">
                <Icon name="check" className="mt-1 h-4 w-4 flex-none text-good" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="card">
            <div className="text-sm font-semibold">Built for HR leaders</div>
            <p className="mt-2 text-sm text-ink-2">See the problems DeepTrace addresses for HR and a worked case study with real computed metrics.</p>
            <Link href="/solutions/hr" className="btn btn-secondary mt-4">
              Explore HR solutions <Icon name="arrowRight" />
            </Link>
          </div>
        </div>
      </Section>

      {/* 10. Trust */}
      <Section id="trust" eyebrow="Trust, security and privacy" title="Sensitive data, handled with restraint.">
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard icon="lock" title="Data minimisation">
            Only mapped fields are kept. Audits send just the one category being analysed.
          </FeatureCard>
          <FeatureCard icon="eye" title="Restricted demographics">
            Raw self-reported attributes are hidden from non-privileged roles; small groups are suppressed.
          </FeatureCard>
          <FeatureCard icon="shield" title="Honest status">
            Our security page separates what is implemented and tested from what is still planned.
          </FeatureCard>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/security" className="btn btn-secondary">Security overview</Link>
          <Link href="/privacy" className="btn btn-secondary">Privacy &amp; data protection</Link>
        </div>
      </Section>

      {/* 11. Methodology */}
      <Section
        id="methodology"
        tone="sunken"
        eyebrow="Methodology and limitations"
        title="Transparent maths. Stated limits."
        intro="Every metric is deterministic and tested against independent calculations. No language model computes or interprets a statistic."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <div className="text-sm font-semibold">What DeepTrace measures</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              <li>Selection rates with Wilson confidence intervals</li>
              <li>Impact ratios against the highest-rate group, with intervals</li>
              <li>Fisher exact and Mann–Whitney tests, Holm-corrected</li>
              <li>Missing-data coverage and small-group suppression</li>
            </ul>
          </div>
          <div className="card">
            <div className="text-sm font-semibold">What it cannot conclude</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              <li>Why a disparity exists</li>
              <li>Whether a process is &ldquo;bias-free&rdquo;</li>
              <li>Whether unlawful discrimination occurred</li>
              <li>Anything about groups too small to report safely</li>
            </ul>
          </div>
        </div>
        <Link href="/methodology" className="btn btn-secondary mt-6">
          Read the methodology <Icon name="arrowRight" />
        </Link>
      </Section>

      {/* 12. FAQ */}
      <Section id="faq" eyebrow="FAQ" title="Questions we expect.">
        <div className="divide-y divide-line rounded-xl border border-line bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <Icon name="chevronDown" className="h-4 w-4 flex-none transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* 13. Final CTA */}
      <CtaBand />
    </>
  );
}
