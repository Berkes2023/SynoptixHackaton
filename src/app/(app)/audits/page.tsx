"use client";

import Link from "next/link";
import { EmptyState, FlagBadge, PageHeader, attrLabel, fmtDate, shortHash, stageLabel } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function AuditsPage() {
  const { state, can } = useStore();
  return (
    <>
      <PageHeader
        title="Audit Lab"
        subtitle="Reproducible observational fairness audits of recorded ATS outcomes."
        actions={
          can("runAudit") && (
            <Link href="/audits/new" className="btn btn-primary">
              New audit
            </Link>
          )
        }
      />
      {state.audits.length === 0 ? (
        <EmptyState title="No audits yet" body="Configure an audit for a job, stage and authorised audit category." href="/audits/new" cta="Configure audit" />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Job · stage</th>
                <th>Category</th>
                <th>Analysed</th>
                <th>Result</th>
                <th>Dataset hash</th>
              </tr>
            </thead>
            <tbody>
              {[...state.audits].reverse().map((a) => (
                <tr key={a.id}>
                  <td className="text-xs">
                    <Link href={`/audits/${a.id}`} className="font-medium text-brand underline">
                      {fmtDate(a.createdAt)}
                    </Link>
                    <div className="text-muted">{a.createdBy}</div>
                  </td>
                  <td>
                    {a.jobTitle} · {stageLabel(a.result.config.stage)}
                  </td>
                  <td>{attrLabel(a.result.config.groupingAttribute)}</td>
                  <td className="tabular">
                    {a.result.sample.analysed} / {a.result.sample.scopedRecords}
                  </td>
                  <td>
                    <FlagBadge flag={a.result.flag} />
                  </td>
                  <td className="font-mono text-xs">{shortHash(a.datasetHash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
