"use client";

import Link from "next/link";
import { EmptyState, PageHeader, fmtDate, shortHash } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function ReportsPage() {
  const { state } = useStore();
  return (
    <>
      <PageHeader title="Audit reports" subtitle="Evidence packages with provenance, methodology, results, limitations and reviewer sign-off." />
      {state.reports.length === 0 ? (
        <EmptyState title="No reports yet" body="Generate a report from any completed audit." href="/audits" cta="Go to audits" />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Generated</th>
                <th>Audit</th>
                <th>By</th>
                <th>SHA-256 checksum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...state.reports].reverse().map((r) => {
                const audit = state.audits.find((a) => a.id === r.auditId);
                return (
                  <tr key={r.id}>
                    <td className="text-sm">{fmtDate(r.generatedAt)}</td>
                    <td className="text-sm">
                      {audit?.jobTitle ?? "—"} · {audit?.result.config.stage}
                    </td>
                    <td className="text-sm">{r.generatedBy}</td>
                    <td className="font-mono text-xs">{shortHash(r.checksum)}</td>
                    <td className="text-right">
                      <Link href={`/reports/${r.id}`} className="text-sm text-brand underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
