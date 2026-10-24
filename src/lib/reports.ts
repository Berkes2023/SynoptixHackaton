import { sha256Hex } from "./hash";
import type { AuditRun, State } from "./state";

export const REPORT_FORMAT_VERSION = "dt-report-1.0";

export const METHODOLOGY_TEXT = [
  "Selection rate per group = selected ÷ analysed, with Wilson score confidence intervals.",
  "Adverse impact ratio = group selection rate ÷ highest group selection rate, with Katz log-method confidence intervals. The 0.8 threshold is a screening heuristic only.",
  "Differences in selection are tested with a two-sided Fisher exact test; ATS score distributions with a two-sided Mann–Whitney U test.",
  "All p-values within an audit are adjusted with the Holm–Bonferroni procedure to control the family-wise error rate.",
  "Groups below the minimum reportable size are suppressed and excluded from comparisons. Missing demographic values are excluded and reported, never imputed or treated as a group.",
  "The analysis is deterministic: identical input records and configuration produce identical results. The dataset hash identifies the exact records analysed.",
];

/** Build the evidence package. Everything in it is derived from stored, deterministic results. */
export async function buildReport(state: State, audit: AuditRun, generatedBy: string) {
  const findings = state.findings
    .filter((f) => f.auditId === audit.id)
    .map((f) => {
      const inv = state.investigations.find((i) => i.findingId === f.id);
      return {
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        summary: f.summary,
        evidence: f.evidence,
        limitations: f.limitations,
        recommended_actions: f.recommendedActions,
        status: f.status,
        investigation: inv
          ? {
              id: inv.id,
              owner: inv.owner,
              status: inv.status,
              resolution: inv.resolution || null,
              rationale: inv.rationale || null,
              closed_by: inv.closedBy ?? null,
              closed_at: inv.closedAt ?? null,
              evidence: inv.evidence.map((e) => ({ label: e.label, reference: e.reference, added_by: e.addedBy, at: e.at })),
              reviewer_notes: inv.notes,
              updated_at: inv.updatedAt,
            }
          : null,
        explanation: f.explanation ?? null,
      };
    });
  const recommendations = [
    ...new Set(
      findings
        .filter((f) => f.severity !== "info" && f.status !== "resolved" && f.status !== "inconclusive")
        .flatMap((f) => f.recommended_actions),
    ),
  ];
  if (findings.some((f) => f.investigation?.resolution === "remediation_required"))
    recommendations.unshift("Track agreed remediation and re-run this audit with the same configuration to confirm the effect.");
  if (recommendations.length === 0) recommendations.push("Re-run this audit periodically (e.g. quarterly) and monitor drift between periods.");
  const imports = state.imports.filter((i) => audit.importIds.includes(i.id));
  const payload = {
    report_format: REPORT_FORMAT_VERSION,
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
    organisation: state.organisation,
    data_type: imports.every((i) => i.dataType === "synthetic") ? "synthetic" : "customer_upload",
    disclaimer:
      "This report presents statistical indicators from recorded screening outcomes. It does not determine whether any organisation has unlawfully discriminated against anyone. Synthetic demonstration data — not real Workday screening results.",
    audit: {
      id: audit.id,
      run_at: audit.createdAt,
      run_by: audit.createdBy,
      job: { ref: audit.result.config.jobRef, title: audit.jobTitle },
      configuration: audit.result.config,
      methodology_version: audit.result.methodologyVersion,
      engine_version: audit.result.engineVersion,
      dataset_hash_sha256: audit.datasetHash,
    },
    provenance: imports.map((i) => ({
      import_id: i.id,
      file_name: i.fileName,
      file_sha256: i.fileHash,
      imported_at: i.createdAt,
      imported_by: i.createdBy,
      source_systems: i.sourceSystems,
      rows_in_file: i.totalRows,
      rows_imported: i.importedRows,
      rows_excluded: i.excludedRows,
      dropped_columns: i.droppedColumns,
    })),
    methodology: METHODOLOGY_TEXT,
    sample: audit.result.sample,
    results: {
      reference_group: audit.result.referenceGroup,
      groups: audit.result.groups,
      selection_comparisons: audit.result.comparisons,
      score_comparisons: audit.result.scoreComparisons,
      flag: audit.result.flag,
      conclusion: audit.result.conclusion,
    },
    findings,
    recommendations,
    limitations: audit.result.limitations,
    versions: {
      report_format: REPORT_FORMAT_VERSION,
      methodology: audit.result.methodologyVersion,
      engine: audit.result.engineVersion,
      application: "deeptrace-2.0.0",
    },
  };
  const checksum = await sha256Hex(JSON.stringify(payload));
  return { payload, checksum };
}
