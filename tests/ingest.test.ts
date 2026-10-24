import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/ingest/csv";
import { autoMap } from "@/lib/ingest/mapping";
import { validateAndMap } from "@/lib/ingest/validate";
import { generateSyntheticCsv } from "@/lib/data/synthetic";
import { runAudit } from "@/lib/fairness/audit";
import { canonicalDataset, sha256Hex } from "@/lib/hash";

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, CRLF and BOM", () => {
    const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n2,,"multi\nline"\r\n';
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([
      ["1", "x, y", 'say "hi"'],
      ["2", "", "multi\nline"],
    ]);
  });
  it("round-trips through toCsv", () => {
    const rows = [["1", 'a "q"', "x,y"]];
    expect(parseCsv(toCsv(["h1", "h2", "h3"], rows)).rows).toEqual(rows);
  });
});

describe("synthetic dataset import", () => {
  const csv = generateSyntheticCsv();
  const { headers, rows } = parseCsv(csv);
  const mapping = autoMap(headers);
  const { records, report } = validateAndMap(headers, rows, mapping);

  it("auto-maps every standard field and drops unmapped columns", () => {
    expect(Object.values(mapping).every((v) => v != null)).toBe(true);
    expect(report.droppedColumns).toEqual(["Recruiter Notes"]);
  });

  it("imports all 325 rows without data loss (200 SE initial screening)", () => {
    expect(rows).toHaveLength(325);
    expect(report.validRows).toBe(325);
    expect(report.excludedRows).toBe(0);
    expect(records.filter((r) => r.jobRef === "REQ-1042" && r.stage === "initial_screening")).toHaveLength(200);
  });

  it("is generated deterministically", async () => {
    expect(generateSyntheticCsv()).toBe(csv);
    expect(await sha256Hex(canonicalDataset(records))).toBe(await sha256Hex(canonicalDataset([...records].reverse())));
  });

  it("reproduces the PRD fixture on the imported data", () => {
    const r = runAudit(records, {
      jobRef: "REQ-1042",
      stage: "initial_screening",
      analysisType: "observational",
      groupingAttribute: "gender",
      metrics: ["selection_rate", "selection_rate_ratio"],
      confidenceLevel: 0.95,
      minimumGroupSize: 20,
      impactThreshold: 0.8,
      alpha: 0.05,
    });
    expect(r.groups.map((g) => [g.group, g.selected, g.n])).toEqual([
      ["Female", 25, 100],
      ["Male", 40, 100],
    ]);
    expect(r.comparisons[0].ratio).toBeCloseTo(0.625, 12);
  });

  it("flags the Data Analyst stage as insufficient with missing coverage", () => {
    const r = runAudit(records, {
      jobRef: "REQ-1077",
      stage: "assessment",
      analysisType: "observational",
      groupingAttribute: "gender",
      metrics: ["selection_rate", "selection_rate_ratio"],
      confidenceLevel: 0.95,
      minimumGroupSize: 20,
      impactThreshold: 0.8,
      alpha: 0.05,
    });
    expect(r.sample.missingAttribute).toBe(24);
    expect(r.flag).toBe("insufficient_data");
  });
});

describe("validation", () => {
  const headers = ["Application ID", "Candidate Ref", "Job Req ID", "Job Title", "Stage", "AI Score", "Screening Decision", "Decision Date", "Source System"];
  const ok = ["A1", "C1", "R1", "Role", "s1", "50", "Advance", "2026-09-01", "fixture"];

  it("excludes duplicates, invalid scores and bad dates", () => {
    const rows = [ok, [...ok], ["A2", "C2", "R1", "Role", "s1", "-3", "Reject", "2026-09-01", "fixture"], ["A3", "C3", "R1", "Role", "s1", "", "Maybe", "not-a-date", "fixture"]];
    const { records, report } = validateAndMap(headers, rows, autoMap(headers));
    expect(records).toHaveLength(1);
    expect(report.excludedRows).toBe(3);
    const codes = report.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["duplicate", "invalid:score", "invalid:decisionAt"]));
    expect(report.issues.find((i) => i.code === "duplicate")!.rows).toEqual([2]);
  });

  it("blocks commit when a required field is unmapped", () => {
    const h = headers.filter((x) => x !== "Decision Date");
    const { report } = validateAndMap(h, [ok.slice(0, 7).concat(ok.slice(8))], autoMap(h));
    expect(report.blocking).toBe(true);
    expect(report.issues[0].code).toBe("unmapped:decisionAt");
  });
});
