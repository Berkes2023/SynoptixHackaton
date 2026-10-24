"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { RESEARCH, RESEARCH_CATEGORIES, type ResearchCategory } from "@/lib/site/research";

export function ResearchLibrary() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ResearchCategory | "All">("All");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return RESEARCH.filter((r) => (cat === "All" || r.category === cat) && (!t || `${r.title} ${r.publisher} ${r.keyFinding} ${r.geography}`.toLowerCase().includes(t))).sort((a, b) =>
      b.isoDate.localeCompare(a.isoDate),
    );
  }, [q, cat]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search title, source or finding" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search research" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {(["All", ...RESEARCH_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3 py-1 text-xs ${cat === c ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface text-ink-2 hover:text-ink"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-xs text-muted" aria-live="polite">
        {list.length} of {RESEARCH.length} entries
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((r) => (
          <article key={r.id} className="card flex flex-col">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand">{r.category}</span>
              <span className="text-muted">{r.date}</span>
            </div>
            <h2 className="mt-2 font-semibold leading-snug">{r.title}</h2>
            <div className="text-sm text-ink-2">{r.publisher}</div>
            <p className="mt-3 text-sm leading-relaxed">{r.keyFinding}</p>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">Scope</dt>
              <dd>{r.geography}</dd>
              {r.population && (
                <>
                  <dt className="text-muted">Population</dt>
                  <dd>{r.population}</dd>
                </>
              )}
              {r.sampleSize && (
                <>
                  <dt className="text-muted">Sample</dt>
                  <dd>{r.sampleSize}</dd>
                </>
              )}
              <dt className="text-muted">Method</dt>
              <dd>{r.method}</dd>
              <dt className="text-muted">Limitations</dt>
              <dd>
                <ul className="list-disc pl-4 text-ink-2">
                  {r.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </dd>
            </dl>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand hover:underline">
              Original publication <Icon name="external" className="h-3.5 w-3.5" />
            </a>
          </article>
        ))}
      </div>
    </>
  );
}
