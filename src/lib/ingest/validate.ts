import { isMissingAttribute, normaliseDecision } from "../fairness/audit";
import type { ScreeningRecord } from "../fairness/types";
import { STANDARD_FIELDS, type Mapping } from "./mapping";

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** 1-based data row numbers (CSV line = row + 1). */
  rows: number[];
}

export interface ValidationReport {
  totalRows: number;
  validRows: number;
  excludedRows: number;
  blocking: boolean;
  issues: ValidationIssue[];
  droppedColumns: string[];
  sourceSystems: string[];
  jobs: { jobRef: string; jobTitle: string; rows: number }[];
}

function parseDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Map raw CSV rows onto the standard schema and validate them. Rows with errors
 * are excluded (and reported); rows with warnings are kept. Unmapped source
 * columns are dropped (data minimisation).
 */
export function validateAndMap(headers: string[], rows: string[][], mapping: Mapping): { records: ScreeningRecord[]; report: ValidationReport } {
  const issues = new Map<string, ValidationIssue>();
  const add = (severity: ValidationIssue["severity"], code: string, message: string, row?: number) => {
    const issue = issues.get(code) ?? { severity, code, message, rows: [] };
    if (row != null) issue.rows.push(row);
    issues.set(code, issue);
  };

  const mappedColumns = new Set(Object.values(mapping).filter(Boolean) as string[]);
  const droppedColumns = headers.filter((h) => !mappedColumns.has(h));

  const missingRequired = STANDARD_FIELDS.filter((f) => f.required && !mapping[f.key]);
  for (const f of missingRequired) add("error", `unmapped:${f.key}`, `Required field "${f.label}" is not mapped to any column.`);
  if (missingRequired.length > 0) {
    return {
      records: [],
      report: { totalRows: rows.length, validRows: 0, excludedRows: rows.length, blocking: true, issues: [...issues.values()], droppedColumns, sourceSystems: [], jobs: [] },
    };
  }

  const index = new Map(headers.map((h, i) => [h, i]));
  const get = (row: string[], key: string): string => {
    const col = mapping[key];
    if (!col) return "";
    return (row[index.get(col)!] ?? "").trim();
  };
  const sensitiveKeys = STANDARD_FIELDS.filter((f) => f.sensitive && mapping[f.key]).map((f) => f.key);

  const seen = new Set<string>();
  const records: ScreeningRecord[] = [];
  let excluded = 0;

  rows.forEach((row, i) => {
    const rowNo = i + 1;
    let bad = false;
    for (const f of STANDARD_FIELDS) {
      if (f.required && get(row, f.key) === "") {
        add("error", `missing:${f.key}`, `Missing required value: ${f.label}.`, rowNo);
        bad = true;
      }
    }
    const decisionAtRaw = get(row, "decisionAt");
    const decisionAt = decisionAtRaw ? parseDate(decisionAtRaw) : null;
    if (decisionAtRaw && !decisionAt) {
      add("error", "invalid:decisionAt", "Decision timestamp is not a valid ISO-8601 date.", rowNo);
      bad = true;
    }
    const appliedRaw = get(row, "appliedAt");
    const appliedAt = appliedRaw ? parseDate(appliedRaw) : null;
    if (appliedRaw && !appliedAt) add("warning", "invalid:appliedAt", "Applied date is not a valid ISO-8601 date; stored as empty.", rowNo);
    if (appliedAt && decisionAt && decisionAt < appliedAt) add("warning", "order:dates", "Decision timestamp precedes the application date.", rowNo);

    const scoreRaw = get(row, "score");
    let score: number | null = null;
    if (scoreRaw !== "") {
      const n = Number(scoreRaw);
      if (!Number.isFinite(n) || n < 0) {
        add("error", "invalid:score", "ATS score is not a non-negative number.", rowNo);
        bad = true;
      } else score = n;
    } else if (mapping.score) add("warning", "missing:score", "ATS score is empty; excluded from score analysis.", rowNo);

    const key = `${get(row, "applicationId")}::${get(row, "stage")}`;
    if (!bad && seen.has(key)) {
      add("error", "duplicate", "Duplicate application ID for the same stage; later occurrence excluded.", rowNo);
      bad = true;
    }
    if (bad) {
      excluded++;
      return;
    }
    seen.add(key);

    const decision = get(row, "decision");
    if (normaliseDecision(decision) == null) add("warning", "unknown:decision", "Decision value not recognised as selected/not selected; treated as missing in audits.", rowNo);

    const sensitive: Record<string, string | null> = {};
    for (const sk of sensitiveKeys) {
      const v = get(row, sk);
      const cat = sk.slice("sensitive.".length);
      sensitive[cat] = isMissingAttribute(v) ? null : v;
      if (sensitive[cat] == null) add("warning", `missing:${sk}`, `No self-reported ${cat.replace("_", " ")} value; kept as missing (never imputed or grouped).`, rowNo);
    }

    records.push({
      applicationId: get(row, "applicationId"),
      candidateRef: get(row, "candidateRef"),
      jobRef: get(row, "jobRef"),
      jobTitle: get(row, "jobTitle"),
      department: get(row, "department") || null,
      appliedAt,
      stage: get(row, "stage"),
      score,
      grade: get(row, "grade") || null,
      decision: decision || null,
      decisionAt: decisionAt!,
      sourceSystem: get(row, "sourceSystem"),
      sensitive,
    });
  });

  const jobs = new Map<string, { jobRef: string; jobTitle: string; rows: number }>();
  for (const r of records) {
    const j = jobs.get(r.jobRef) ?? { jobRef: r.jobRef, jobTitle: r.jobTitle, rows: 0 };
    j.rows++;
    jobs.set(r.jobRef, j);
  }

  return {
    records,
    report: {
      totalRows: rows.length,
      validRows: records.length,
      excludedRows: excluded,
      blocking: records.length === 0,
      issues: [...issues.values()].sort((a, b) => (a.severity === b.severity ? a.code.localeCompare(b.code) : a.severity === "error" ? -1 : 1)),
      droppedColumns,
      sourceSystems: [...new Set(records.map((r) => r.sourceSystem))].sort(),
      jobs: [...jobs.values()].sort((a, b) => a.jobRef.localeCompare(b.jobRef)),
    },
  };
}
