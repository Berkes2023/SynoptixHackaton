import { runAudit } from "./audit";
import type { AuditConfig, ScreeningRecord } from "./types";

export type DriftPeriodBy = "month" | "scoringVersion";

export interface DriftPeriod {
  period: string;
  scoped: number;
  analysed: number;
  missingAttribute: number;
  referenceGroup: string | null;
  focusGroup: string | null;
  ratio: number | null;
  ratioCi: { lower: number; upper: number } | null;
  rates: { group: string; rate: number | null; n: number | null; suppressed: boolean }[];
  flag: "investigation_recommended" | "no_flag" | "insufficient_data";
}

export interface DriftAlert {
  period: string;
  kind: "crossed_below_threshold" | "recovered_above_threshold" | "material_shift" | "below_threshold_first_period";
  message: string;
}

/** Ratio change treated as material between consecutive periods. */
export const MATERIAL_SHIFT = 0.1;

const periodOf = (r: ScreeningRecord, by: DriftPeriodBy) => (by === "month" ? r.decisionAt.slice(0, 7) : (r.scoringVersion ?? "unversioned"));

/**
 * Runs the same deterministic audit for each period (calendar month or scoring
 * version) and flags threshold crossings and material shifts. The lowest
 * impact ratio among comparisons is tracked per period.
 */
export function computeDrift(records: ScreeningRecord[], config: AuditConfig, by: DriftPeriodBy): { periods: DriftPeriod[]; alerts: DriftAlert[] } {
  const scoped = records.filter((r) => r.jobRef === config.jobRef && r.stage === config.stage);
  const keys = [...new Set(scoped.map((r) => periodOf(r, by)))].sort();
  const selectionConfig: AuditConfig = { ...config, metrics: ["selection_rate", "selection_rate_ratio"] };

  const periods: DriftPeriod[] = keys.map((period) => {
    const res = runAudit(
      scoped.filter((r) => periodOf(r, by) === period),
      selectionConfig,
    );
    const worst = [...res.comparisons].sort((a, b) => (a.ratio ?? 1) - (b.ratio ?? 1))[0];
    return {
      period,
      scoped: res.sample.scopedRecords,
      analysed: res.sample.analysed,
      missingAttribute: res.sample.missingAttribute,
      referenceGroup: res.referenceGroup,
      focusGroup: worst?.group ?? null,
      ratio: worst?.ratio ?? null,
      ratioCi: worst?.ratioCi ?? null,
      rates: res.groups.map((g) => ({ group: g.group, rate: g.selectionRate, n: g.n, suppressed: g.suppressed })),
      flag: res.flag,
    };
  });

  const alerts: DriftAlert[] = [];
  let prev: DriftPeriod | null = null;
  for (const p of periods) {
    if (p.ratio == null) {
      prev = null;
      continue;
    }
    const pct = (x: number) => x.toFixed(2);
    if (!prev && p.ratio < config.impactThreshold) {
      alerts.push({ period: p.period, kind: "below_threshold_first_period", message: `${p.focusGroup} ratio ${pct(p.ratio)} is below ${config.impactThreshold} in the first comparable period.` });
    } else if (prev?.ratio != null) {
      if (prev.ratio >= config.impactThreshold && p.ratio < config.impactThreshold)
        alerts.push({ period: p.period, kind: "crossed_below_threshold", message: `${p.focusGroup} ratio fell from ${pct(prev.ratio)} to ${pct(p.ratio)}, crossing the ${config.impactThreshold} threshold.` });
      else if (prev.ratio < config.impactThreshold && p.ratio >= config.impactThreshold)
        alerts.push({ period: p.period, kind: "recovered_above_threshold", message: `${p.focusGroup} ratio rose from ${pct(prev.ratio)} to ${pct(p.ratio)}, back above the threshold.` });
      else if (Math.abs(p.ratio - prev.ratio) >= MATERIAL_SHIFT)
        alerts.push({ period: p.period, kind: "material_shift", message: `${p.focusGroup} ratio moved from ${pct(prev.ratio)} to ${pct(p.ratio)} (≥ ${MATERIAL_SHIFT} change).` });
    }
    prev = p;
  }
  return { periods, alerts };
}
