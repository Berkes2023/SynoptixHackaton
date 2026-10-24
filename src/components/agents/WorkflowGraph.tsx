"use client";

import { AGENTS } from "@/lib/agents/agents";
import type { TaskRecord, WorkflowRun } from "@/lib/agents/contracts";

const PHASES = ["VALIDATING", "ANALYSING", "EXPERIMENTING", "VERIFYING", "REPORTING"] as const;
const W = 176;
const H = 46;
const COL = 210;
const ROW = 64;

const STATUS_STYLE: Record<TaskRecord["status"], { fill: string; stroke: string; label: string }> = {
  pending: { fill: "var(--surface-2)", stroke: "var(--line-strong)", label: "Pending" },
  running: { fill: "var(--brand-soft)", stroke: "var(--brand)", label: "Running" },
  succeeded: { fill: "var(--color-green-50)", stroke: "#0ca30c", label: "Succeeded" },
  failed: { fill: "var(--color-red-50)", stroke: "#d03b3b", label: "Failed" },
  skipped: { fill: "var(--color-amber-50)", stroke: "#eda100", label: "Skipped" },
  cancelled: { fill: "var(--surface-sunken)", stroke: "var(--muted)", label: "Cancelled" },
};

/** Task dependency graph laid out by workflow phase. Built from persisted task records only. */
export function WorkflowGraph({ run, selected, onSelect }: { run: WorkflowRun; selected?: string | null; onSelect?: (taskId: string) => void }) {
  const phases = PHASES.filter((p) => run.tasks.some((t) => t.phase === p));
  const pos = new Map<string, { x: number; y: number }>();
  phases.forEach((p, ci) => run.tasks.filter((t) => t.phase === p).forEach((t, ri) => pos.set(t.taskId, { x: 12 + ci * COL, y: 34 + ri * ROW })));
  const rows = Math.max(1, ...phases.map((p) => run.tasks.filter((t) => t.phase === p).length));
  const width = Math.max(12 + phases.length * COL, 300);
  const height = 34 + rows * ROW;

  if (run.tasks.length === 0) return <p className="text-sm text-ink-2">No tasks planned yet.</p>;
  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Workflow task graph" className="min-w-full">
        {phases.map((p, ci) => (
          <text key={p} x={12 + ci * COL} y={18} style={{ fill: "var(--muted)", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>
            {p}
          </text>
        ))}
        {run.tasks.flatMap((t) =>
          t.dependsOn
            .filter((d) => pos.has(d))
            .map((d) => {
              const a = pos.get(d)!;
              const b = pos.get(t.taskId)!;
              const x1 = a.x + W;
              const y1 = a.y + H / 2;
              const x2 = b.x;
              const y2 = b.y + H / 2;
              const back = x2 <= x1;
              const path = back ? `M${a.x + W / 2},${a.y + H} C${a.x + W / 2},${y2 + 30} ${x2 + W / 2},${y2 + 30} ${x2 + W / 2},${b.y + H}` : `M${x1},${y1} C${x1 + 24},${y1} ${x2 - 24},${y2} ${x2},${y2}`;
              return <path key={`${d}->${t.taskId}`} d={path} fill="none" style={{ stroke: "var(--line-strong)" }} strokeWidth={1.5} markerEnd="url(#arrow)" />;
            }),
        )}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--line-strong)" }} />
          </marker>
        </defs>
        {run.tasks.map((t) => {
          const p = pos.get(t.taskId);
          if (!p) return null;
          const st = STATUS_STYLE[t.status];
          const isSel = selected === t.taskId;
          return (
            <g
              key={t.taskId}
              transform={`translate(${p.x},${p.y})`}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${AGENTS[t.agent].name}, ${t.operation}: ${st.label}`}
              onClick={() => onSelect?.(t.taskId)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect?.(t.taskId))}
              style={{ cursor: onSelect ? "pointer" : undefined, outline: "none" }}
            >
              <rect width={W} height={H} rx={10} style={{ fill: st.fill, stroke: isSel ? "var(--brand)" : st.stroke }} strokeWidth={isSel ? 2.5 : 1.5} strokeDasharray={t.status === "cancelled" || t.status === "skipped" ? "4 3" : undefined} />
              <text x={10} y={19} style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }}>
                {AGENTS[t.agent].name.replace(" Agent", "")}
              </text>
              <text x={10} y={35} style={{ fill: "var(--ink-2)", fontSize: 11 }}>
                {t.operation} · {st.label}
                {t.attempts > 1 ? ` · ${t.attempts} tries` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const STATE_COLOR: Record<string, "neutral" | "brand" | "amber" | "red" | "green" | "orange"> = {
  CREATED: "neutral",
  VALIDATING: "brand",
  PLANNING: "brand",
  ANALYSING: "brand",
  EXPERIMENTING: "brand",
  VERIFYING: "brand",
  AWAITING_REVIEW: "amber",
  REPORTING: "brand",
  COMPLETED: "green",
  FAILED: "red",
  CANCELLED: "neutral",
};
