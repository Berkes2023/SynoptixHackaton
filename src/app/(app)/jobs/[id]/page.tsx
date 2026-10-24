"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, FlagBadge, PageHeader, Restricted, attrLabel, fmtDate, pct, stageLabel } from "@/components/ui";
import { normaliseDecision } from "@/lib/fairness/audit";
import { mean } from "@/lib/fairness/stats";
import { useStore } from "@/lib/store";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const jobRef = decodeURIComponent(id);
  const { state, can } = useStore();
  const records = state.records.filter((r) => r.jobRef === jobRef);
  if (records.length === 0) return <EmptyState title="Job not found" body={`No imported records for ${jobRef}.`} href="/jobs" cta="All jobs" />;

  const stages = [...new Set(records.map((r) => r.stage))].map((stage) => {
    const rs = records.filter((r) => r.stage === stage);
    const selected = rs.filter((r) => normaliseDecision(r.decision) === "selected").length;
    const scores = rs.map((r) => r.score).filter((s): s is number => s != null);
    return { stage, total: rs.length, selected, unknown: rs.filter((r) => normaliseDecision(r.decision) == null).length, meanScore: scores.length ? mean(scores) : null };
  });
  const audits = state.audits.filter((a) => a.result.config.jobRef === jobRef);
  const showRaw = can("viewRawSensitive");

  return (
    <>
      <PageHeader
        title={`${records[0].jobTitle}`}
        subtitle={`${jobRef} · ${records[0].department ?? "No department"} · source ${[...new Set(records.map((r) => r.sourceSystem))].join(", ")}`}
        actions={
          <Link href={`/audits/new?job=${encodeURIComponent(jobRef)}`} className="btn btn-primary">
            Audit this job
          </Link>
        }
      />
      <section className="card mb-6">
        <h2 className="text-sm font-semibold">Recruitment-stage summary</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="table tabular">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Screened</th>
                <th>Selected</th>
                <th>Selection rate</th>
                <th>Unrecognised decisions</th>
                <th>Mean ATS score</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.stage}>
                  <td className="font-medium">{stageLabel(s.stage)}</td>
                  <td>{s.total}</td>
                  <td>{s.selected}</td>
                  <td>{pct(s.selected / s.total)}</td>
                  <td>{s.unknown}</td>
                  <td>{s.meanScore?.toFixed(1) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card mb-6">
        <h2 className="text-sm font-semibold">Audits for this job</h2>
        {audits.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {audits.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link className="text-brand underline" href={`/audits/${a.id}`}>
                  {stageLabel(a.result.config.stage)} · {attrLabel(a.result.config.groupingAttribute)}
                </Link>
                <span className="flex items-center gap-2 text-xs text-ink-2">
                  {fmtDate(a.createdAt)} <FlagBadge flag={a.result.flag} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="text-sm font-semibold">Screening records (first 25)</h2>
        <p className="mb-3 text-xs text-ink-2">Pseudonymous identifiers only. Names and CVs are not imported.</p>
        {!showRaw && <Restricted what="view raw sensitive attribute values (Admin only). Group-level results remain available in audits" />}
        <div className="mt-3 overflow-x-auto">
          <table className="table tabular text-xs">
            <thead>
              <tr>
                <th>Application</th>
                <th>Candidate</th>
                <th>Stage</th>
                <th>Score</th>
                <th>Grade</th>
                <th>Decision</th>
                <th>Gender</th>
                <th>Age band</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 25).map((r) => (
                <tr key={r.applicationId + r.stage}>
                  <td>{r.applicationId}</td>
                  <td>{r.candidateRef}</td>
                  <td>{r.stage}</td>
                  <td>{r.score ?? "—"}</td>
                  <td>{r.grade ?? "—"}</td>
                  <td>{r.decision}</td>
                  <td>{showRaw ? (r.sensitive.gender ?? "missing") : "🔒"}</td>
                  <td>{showRaw ? (r.sensitive.age_band ?? "missing") : "🔒"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
