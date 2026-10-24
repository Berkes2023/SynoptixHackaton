import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, Logo, type IconName } from "@/components/Icon";
import { MEGA_MENU } from "@/lib/site/nav";
import type { ResearchEntry } from "@/lib/site/research";
import { SITE } from "@/lib/site/config";

export function Section({ id, eyebrow, title, intro, children, className = "", tone = "plain" }: {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: "plain" | "sunken";
}) {
  return (
    <section id={id} className={`scroll-mt-20 ${tone === "sunken" ? "border-y border-line bg-sunken" : ""} ${className}`}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        {(eyebrow || title || intro) && (
          <div className="mb-10 max-w-3xl">
            {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
            {title && <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>}
            {intro && <p className="mt-4 text-lg leading-relaxed text-ink-2">{intro}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export function PageHero({ eyebrow, title, intro, actions }: { eyebrow: string; title: ReactNode; intro: ReactNode; actions?: ReactNode }) {
  return (
    <div className="border-b border-line">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="eyebrow mb-4">{eyebrow}</div>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-2">{intro}</p>
        {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </div>
  );
}

export function FeatureCard({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="card h-full">
      <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-brand-soft text-brand">
        <Icon name={icon} />
      </span>
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

/** Statistic card with a native disclosure for "what this does and doesn't show". */
export function StatCard({ entry }: { entry: ResearchEntry }) {
  return (
    <article className="card flex h-full flex-col">
      <div className="text-5xl font-semibold tracking-tight text-brand">{entry.stat!.value}</div>
      <p className="mt-3 text-sm leading-relaxed">{entry.stat!.label}.</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-2">
        <dt className="text-muted">Source</dt>
        <dd>{entry.publisher}</dd>
        <dt className="text-muted">Published</dt>
        <dd>{entry.date}</dd>
        {entry.sampleSize && (
          <>
            <dt className="text-muted">Sample</dt>
            <dd>{entry.sampleSize}</dd>
          </>
        )}
      </dl>
      <details className="group mt-4 text-xs">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-brand">
          <Icon name="info" className="h-3.5 w-3.5" /> What this does and doesn&apos;t show
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
          {entry.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
      <a href={entry.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-brand hover:underline">
        Read the source <Icon name="external" className="h-3 w-3" />
      </a>
    </article>
  );
}

export function CtaBand({ title = "See a real audit, start to finish.", body = "Fictional data, genuine statistics, a real investigation and a downloadable report. No account needed." }: { title?: string; body?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-line bg-surface p-8 shadow-card sm:p-12 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-3 text-ink-2">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className="btn btn-primary btn-lg">
            Launch Interactive Demo <Icon name="arrowRight" />
          </Link>
          <Link href="/contact" className="btn btn-secondary btn-lg">
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-semibold">DeepTrace</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-ink-2">{SITE.motto}</p>
          <p className="mt-4 max-w-xs text-xs text-muted">
            A prototype. All demo data is synthetic. DeepTrace does not make hiring decisions or determine whether unlawful discrimination occurred.
          </p>
        </div>
        {MEGA_MENU.map((g) => (
          <nav key={g.label} aria-label={g.label}>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-2">{g.label}</div>
            <ul className="mt-3 space-y-2 text-sm">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="text-ink-2 hover:text-ink">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:px-6">
          <span>
            © {new Date().getFullYear()} DeepTrace prototype. Not affiliated with Workday or any ATS vendor. <span className="font-mono">v{process.env.NEXT_PUBLIC_BUILD_ID ?? "local"}</span>
          </span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/security" className="hover:text-ink">Security</Link>
            <Link href="/contact" className="hover:text-ink">Contact</Link>
            <a href={SITE.repo} target="_blank" rel="noopener noreferrer" className="hover:text-ink">Source</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
