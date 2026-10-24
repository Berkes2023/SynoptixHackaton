import type { FindingExplanation as Explanation } from "@/lib/fairness/types";

/** "Explain this finding" — the six questions a non-technical reviewer needs answered. */
export function FindingExplanation({ explanation }: { explanation?: Explanation }) {
  if (!explanation) return null;
  const rows: [string, React.ReactNode][] = [
    ["What was measured", explanation.measured],
    ["Which data was used", explanation.dataUsed],
    ["Which groups were compared", explanation.groupsCompared],
    ["Why the alert was triggered", explanation.trigger],
    [
      "What cannot be concluded",
      <ul key="c" className="list-disc space-y-1 pl-4">
        {explanation.cannotConclude.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>,
    ],
    [
      "Appropriate next steps",
      <ul key="n" className="list-disc space-y-1 pl-4">
        {explanation.nextSteps.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>,
    ],
  ];
  return (
    <details className="group mt-4 rounded-lg border border-line bg-surface-2">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-medium">
        Explain this finding in plain English
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <dl className="grid gap-x-6 gap-y-3 border-t border-line px-4 py-4 text-sm sm:grid-cols-[200px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-medium text-ink-2">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
