"use client";

import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function JobsPage() {
  const { state } = useStore();
  const jobs = new Map<string, { title: string; department: string | null; apps: Set<string>; stages: Set<string> }>();
  for (const r of state.records) {
    const j = jobs.get(r.jobRef) ?? { title: r.jobTitle, department: r.department, apps: new Set(), stages: new Set() };
    j.apps.add(r.applicationId);
    j.stages.add(r.stage);
    jobs.set(r.jobRef, j);
  }

  return (
    <>
      <PageHeader title="Job requisitions" subtitle="Requisitions found in imported screening records." />
      {jobs.size === 0 ? (
        <EmptyState title="No jobs yet" body="Import a dataset to see requisitions." href="/imports" cta="Go to Data Hub" />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Requisition</th>
                <th>Title</th>
                <th>Department</th>
                <th>Applications</th>
                <th>Stages</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...jobs.entries()].sort().map(([ref, j]) => (
                <tr key={ref}>
                  <td className="font-mono text-xs">{ref}</td>
                  <td className="font-medium">{j.title}</td>
                  <td>{j.department ?? "—"}</td>
                  <td className="tabular">{j.apps.size}</td>
                  <td className="text-xs">{[...j.stages].join(", ")}</td>
                  <td className="text-right">
                    <Link href={`/jobs/${encodeURIComponent(ref)}`} className="text-sm text-brand underline">
                      Summary
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
