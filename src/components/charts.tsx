"use client";

import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AuditResult } from "@/lib/fairness/types";

/** Categorical slots in fixed order (validated reference palette, first three are all-pairs safe). */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const AXIS = { stroke: "#c3c2b7", tick: { fill: "#52514e", fontSize: 12 }, tickLine: false } as const;

export function groupColor(groups: string[], group: string): string {
  return SERIES[Math.max(0, groups.indexOf(group)) % SERIES.length];
}

function TooltipBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 text-ink-2">
          <span>{k}</span>
          <span className="tabular font-medium text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function SelectionRateChart({ result, height = 280 }: { result: AuditResult; height?: number }) {
  const all = result.groups.map((g) => g.group);
  const data = result.groups
    .filter((g) => !g.suppressed)
    .map((g) => ({
      group: g.group,
      rate: g.selectionRate! * 100,
      err: [(g.selectionRate! - g.ci!.lower) * 100, (g.ci!.upper - g.selectionRate!) * 100],
      lo: g.ci!.lower * 100,
      hi: g.ci!.upper * 100,
      n: g.n!,
      selected: g.selected!,
    }));
  const ref = result.groups.find((g) => g.group === result.referenceGroup);
  const threshold = ref ? ref.selectionRate! * result.config.impactThreshold * 100 : null;
  const yMax = Math.min(100, Math.ceil(Math.max(10, ...data.map((d) => d.hi)) / 10) * 10 + 10);

  return (
    <div style={{ width: "100%", height }} role="img" aria-label="Selection rate by group with confidence intervals">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="#e1e0d9" />
          <XAxis dataKey="group" {...AXIS} />
          <YAxis {...AXIS} axisLine={false} unit="%" domain={[0, yMax]} width={48} className="tabular" />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <TooltipBox
                  title={d.group}
                  rows={[
                    ["Selected", `${d.selected} of ${d.n}`],
                    ["Selection rate", `${d.rate.toFixed(1)}%`],
                    [`${Math.round(result.config.confidenceLevel * 100)}% CI`, `${d.lo.toFixed(1)}–${d.hi.toFixed(1)}%`],
                  ]}
                />
              );
            }}
          />
          {threshold != null && (
            <ReferenceLine
              y={threshold}
              stroke="#898781"
              strokeDasharray="4 4"
              label={{ value: `${result.config.impactThreshold} × reference rate`, position: "insideTopRight", fill: "#52514e", fontSize: 11 }}
            />
          )}
          <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.group} fill={groupColor(all, d.group)} />
            ))}
            <ErrorBar dataKey="err" width={10} strokeWidth={1.5} stroke="#0b0b0b" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreHistogram({ result, height = 260 }: { result: AuditResult; height?: number }) {
  const edges = result.histogramEdges;
  const groups = result.groups.filter((g) => !g.suppressed && g.histogram);
  if (!edges || groups.length === 0) return null;
  const all = result.groups.map((g) => g.group);
  const data = edges.slice(0, -1).map((e, i) => {
    const row: Record<string, number | string> = { bin: `${e}–${edges[i + 1]}` };
    for (const g of groups) row[g.group] = (g.histogram![i] / g.n!) * 100;
    return row;
  });
  return (
    <div style={{ width: "100%", height }} role="img" aria-label="ATS score distribution by group">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#e1e0d9" />
          <XAxis dataKey="bin" {...AXIS} interval={0} fontSize={11} />
          <YAxis {...AXIS} axisLine={false} unit="%" width={48} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox title={`Score ${label}`} rows={payload.map((p) => [String(p.name), `${Number(p.value).toFixed(1)}% of group`])} />
              ) : null
            }
          />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: "#52514e" }} />
          {groups.map((g) => (
            <Bar key={g.group} dataKey={g.group} fill={groupColor(all, g.group)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DeltaChart({ deltas, height = 220 }: { deltas: { id: string; delta: number }[]; height?: number }) {
  const counts = new Map<number, number>();
  for (const d of deltas) counts.set(d.delta, (counts.get(d.delta) ?? 0) + 1);
  const data = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([delta, count]) => ({ delta: delta.toFixed(1), count }));
  return (
    <div style={{ width: "100%", height }} role="img" aria-label="Distribution of score changes between matched profiles">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e1e0d9" />
          <XAxis dataKey="delta" {...AXIS} label={{ value: "Score change (variant − base)", position: "insideBottom", offset: -2, fill: "#898781", fontSize: 11 }} height={40} />
          <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={36} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox title={`Δ ${payload[0].payload.delta}`} rows={[["Matched pairs", String(payload[0].value)]]} />
              ) : null
            }
          />
          <Bar dataKey="count" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Selection rate per group, before and after a mitigation, with confidence intervals. */
export function BeforeAfterChart({
  rows,
  confidence,
  height = 260,
}: {
  rows: { phase: string; reference: { group: string; rate: number; lo: number; hi: number; n: number; selected: number }; affected: { group: string; rate: number; lo: number; hi: number; n: number; selected: number } }[];
  confidence: number;
  height?: number;
}) {
  const data = rows.map((r) => ({
    phase: r.phase,
    // Avoid "ref" as a key: Recharts spreads row fields onto elements and "ref" is reserved by React.
    referenceRate: r.reference.rate * 100,
    affectedRate: r.affected.rate * 100,
    refErr: [(r.reference.rate - r.reference.lo) * 100, (r.reference.hi - r.reference.rate) * 100],
    affErr: [(r.affected.rate - r.affected.lo) * 100, (r.affected.hi - r.affected.rate) * 100],
    raw: r,
  }));
  const refName = rows[0]?.reference.group ?? "Reference";
  const affName = rows[0]?.affected.group ?? "Affected";
  const yMax = Math.min(100, Math.ceil(Math.max(10, ...rows.flatMap((r) => [r.reference.hi, r.affected.hi]).map((x) => x * 100)) / 10) * 10 + 10);
  return (
    <div>
    <div className="flex flex-wrap gap-4 text-xs text-ink-2" aria-hidden="true">
      {[[affName, SERIES[1]], [refName, SERIES[0]]].map(([name, color]) => (
        <span key={name} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {name}
        </span>
      ))}
    </div>
    <div style={{ width: "100%", height }} role="img" aria-label={`Shortlisting rate for ${affName} and ${refName}, before and after mitigation`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }} barCategoryGap="28%" barGap={6}>
          <CartesianGrid vertical={false} stroke="#e1e0d9" />
          <XAxis dataKey="phase" {...AXIS} />
          <YAxis {...AXIS} axisLine={false} unit="%" domain={[0, yMax]} width={48} className="tabular" />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = (payload[0].payload as (typeof data)[number]).raw;
              const fmt = (g: typeof d.reference) => `${g.selected} of ${g.n} (${(g.rate * 100).toFixed(1)}%, ${Math.round(confidence * 100)}% CI ${(g.lo * 100).toFixed(1)}–${(g.hi * 100).toFixed(1)}%)`;
              return <TooltipBox title={d.phase} rows={[[d.affected.group, fmt(d.affected)], [d.reference.group, fmt(d.reference)]]} />;
            }}
          />
          <Bar dataKey="affectedRate" name={affName} fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false}>
            <ErrorBar dataKey="affErr" width={8} strokeWidth={1.5} stroke="#0b0b0b" />
          </Bar>
          <Bar dataKey="referenceRate" name={refName} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false}>
            <ErrorBar dataKey="refErr" width={8} strokeWidth={1.5} stroke="#0b0b0b" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}
