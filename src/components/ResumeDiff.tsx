import { diffResumes, renderResume, type PackResume, type ResumeLine } from "@/lib/data/resumes";
import type { SyntheticProfile } from "@/lib/fairness/counterfactual";

function Column({ title, score, advances, lines, changed, kind }: {
  title: string;
  score: number;
  advances: boolean;
  lines: ResumeLine[];
  changed: Set<string>;
  kind: "removed" | "added";
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">{title}</span>
        <span className="tabular text-sm">
          Mock score <strong>{score}</strong> · {advances ? <span className="text-green-800">advances</span> : <span className="text-critical">rejected</span>}
        </span>
      </div>
      <div className="space-y-1 px-4 py-3 text-sm">
        {lines.map((l, i) => {
          const isChanged = changed.has(l.text);
          const tone = !isChanged
            ? ""
            : kind === "removed"
              ? "rounded bg-red-50 px-1 text-red-900 line-through decoration-red-400"
              : "rounded bg-green-50 px-1 text-green-900";
          return (
            <p
              key={i}
              className={`${l.section === "summary" ? "italic text-ink-2" : ""} ${l.emphasis ? "font-medium" : l.section === "work" ? "pl-3 text-xs text-ink-2" : ""} ${l.section === "meta" ? "text-xs" : ""} ${tone}`}
            >
              {isChanged && <span aria-hidden className="mr-1 font-mono">{kind === "removed" ? "−" : "+"}</span>}
              {isChanged && <span className="sr-only">{kind === "removed" ? "Removed: " : "Added: "}</span>}
              {l.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export function ResumeDiff(props: {
  resume: PackResume;
  base: SyntheticProfile;
  variant: SyntheticProfile;
  baseScore: number;
  variantScore: number;
  threshold: number;
}) {
  const baseLines = renderResume(props.resume, props.base);
  const variantLines = renderResume(props.resume, props.variant);
  const { removed, added } = diffResumes(baseLines, variantLines);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Column title="Base CV" score={props.baseScore} advances={props.baseScore >= props.threshold} lines={baseLines} changed={removed} kind="removed" />
      <Column title="Variant CV" score={props.variantScore} advances={props.variantScore >= props.threshold} lines={variantLines} changed={added} kind="added" />
    </div>
  );
}
