"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, EmptyState, PageHeader, Restricted, SeverityBadge, fmtDate, stageLabel } from "@/components/ui";
import { USERS, useStore, type Investigation, type Resolution } from "@/lib/store";

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: "", label: "— not yet decided —" },
  { value: "explained_by_job_related_factors", label: "Explained by documented job-related factors" },
  { value: "remediation_required", label: "Remediation required" },
  { value: "data_quality_issue", label: "Data-quality issue — re-audit needed" },
  { value: "no_action_required", label: "No action required" },
];

function InvestigationCard({ inv }: { inv: Investigation }) {
  const { state, update, log, can, user } = useStore();
  const finding = state.findings.find((f) => f.id === inv.findingId);
  const audit = state.audits.find((a) => a.id === finding?.auditId);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canEdit = can("openInvestigation");
  const canResolve = can("resolveInvestigation");

  function patch(changes: Partial<Investigation>, action: string, details: string) {
    const now = new Date().toISOString();
    update((s) => ({
      ...s,
      investigations: s.investigations.map((i) => (i.id === inv.id ? { ...i, ...changes, updatedAt: now } : i)),
      findings: s.findings.map((f) =>
        f.id === inv.findingId && changes.status ? { ...f, status: changes.status === "resolved" ? "resolved" : "investigating" } : f,
      ),
    }));
    log(action, `investigation:${inv.id}`, details);
  }

  function addNote() {
    if (!note.trim()) return;
    patch({ notes: [...inv.notes, { author: `${user.name} (${user.role})`, text: note.trim(), at: new Date().toISOString() }] }, "investigation.note_added", note.trim().slice(0, 80));
    setNote("");
  }

  function resolve() {
    setError(null);
    if (!inv.resolution) return setError("Choose a resolution before closing.");
    if (inv.notes.length === 0) return setError("Add at least one reviewer note explaining the decision.");
    patch({ status: "resolved" }, "investigation.resolved", inv.resolution);
  }

  if (!finding) return null;
  return (
    <article id={inv.id} className="card scroll-mt-20">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <Badge color={inv.status === "resolved" ? "green" : inv.status === "in_review" ? "brand" : "neutral"}>{inv.status.replace("_", " ")}</Badge>
          </div>
          <h3 className="mt-2 font-semibold">{finding.title}</h3>
          <p className="text-xs text-ink-2">
            {audit?.jobTitle} · {stageLabel(audit?.result.config.stage ?? "")} · opened {fmtDate(inv.createdAt)} ·{" "}
            <Link className="text-brand underline" href={`/audits/${finding.auditId}#${finding.id}`}>
              evidence
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Owner</label>
          <select
            className="input"
            disabled={!canEdit || inv.status === "resolved"}
            value={inv.owner}
            onChange={(e) => patch({ owner: e.target.value }, "investigation.assigned", e.target.value)}
          >
            {USERS.filter((u) => u.role !== "Read-only").map((u) => (
              <option key={u.name} value={u.name}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select
            className="input"
            disabled={!canEdit || inv.status === "resolved"}
            value={inv.status === "resolved" ? "resolved" : inv.status}
            onChange={(e) => patch({ status: e.target.value as Investigation["status"] }, "investigation.status_changed", e.target.value)}
          >
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            {inv.status === "resolved" && <option value="resolved">Resolved</option>}
          </select>
        </div>
        <div>
          <label className="label">Resolution</label>
          <select
            className="input"
            disabled={!canResolve || inv.status === "resolved"}
            value={inv.resolution}
            onChange={(e) => patch({ resolution: e.target.value as Resolution }, "investigation.resolution_set", e.target.value || "cleared")}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <div className="label">Reviewer notes</div>
        {inv.notes.length === 0 ? (
          <p className="text-sm text-ink-2">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {inv.notes.map((n, i) => (
              <li key={i} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
                <div className="text-xs text-muted">
                  {n.author} · {fmtDate(n.at)}
                </div>
                <div className="mt-0.5 whitespace-pre-wrap">{n.text}</div>
              </li>
            ))}
          </ul>
        )}
        {canEdit && inv.status !== "resolved" && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <textarea
              className="input min-h-[64px]"
              placeholder="e.g. Reviewed knockout questions; a 'relocation required' filter disproportionately removed applicants…"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="btn btn-secondary self-start" onClick={addNote} disabled={!note.trim()}>
              Add note
            </button>
          </div>
        )}
      </div>

      {inv.status !== "resolved" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canResolve ? (
            <button className="btn btn-primary" onClick={resolve}>
              Sign off &amp; resolve
            </button>
          ) : (
            <Restricted what="sign off resolutions (Reviewer or Admin required)" />
          )}
          {error && <span className="text-sm text-critical">{error}</span>}
        </div>
      )}
      {inv.status === "resolved" && (
        <p className="mt-4 text-sm text-green-800">
          ✓ Resolved: {RESOLUTIONS.find((r) => r.value === inv.resolution)?.label} · {fmtDate(inv.updatedAt)}
        </p>
      )}
    </article>
  );
}

export default function InvestigationsPage() {
  const { state } = useStore();
  const pending = state.findings.filter((f) => f.status === "open" && f.severity !== "info" && !state.investigations.some((i) => i.findingId === f.id));
  return (
    <>
      <PageHeader title="Investigation Centre" subtitle="Human review of findings. DeepTrace surfaces evidence; people make and record decisions." />
      {pending.length > 0 && (
        <section className="card mb-6">
          <h2 className="text-sm font-semibold">Findings awaiting an investigation ({pending.length})</h2>
          <ul className="mt-2 divide-y divide-line">
            {pending.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <SeverityBadge severity={f.severity} /> {f.title}
                </span>
                <Link href={`/audits/${f.auditId}#${f.id}`} className="text-brand underline">
                  Review evidence
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {state.investigations.length === 0 ? (
        <EmptyState title="No investigations yet" body="Open an investigation from a finding on an audit page." href="/audits" cta="Go to audits" />
      ) : (
        <div className="space-y-4">
          {[...state.investigations].reverse().map((inv) => (
            <InvestigationCard key={inv.id} inv={inv} />
          ))}
        </div>
      )}
    </>
  );
}
