"use client";

import Link from "next/link";
import { useState } from "react";
import { FindingExplanation } from "@/components/FindingExplanation";
import { Badge, EmptyState, PageHeader, Restricted, SeverityBadge, fmtDate, stageLabel } from "@/components/ui";
import { safeReference } from "@/lib/security/links";
import {
  INVESTIGATION_STATUS_LABEL,
  USERS,
  newId,
  useStore,
  type Investigation,
  type InvestigationStatus,
  type Resolution,
} from "@/lib/store";

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: "", label: "— not yet decided —" },
  { value: "explained_by_job_related_factors", label: "Explained by documented job-related factors" },
  { value: "remediation_required", label: "Remediation required" },
  { value: "data_quality_issue", label: "Data-quality issue — re-audit needed" },
  { value: "no_action_required", label: "No action required" },
];

const OPEN_STATUSES: InvestigationStatus[] = ["open", "under_review", "more_evidence_required"];
const statusColor = (s: InvestigationStatus) =>
  s === "resolved" ? "green" : s === "inconclusive" ? "amber" : s === "more_evidence_required" ? "orange" : s === "under_review" ? "brand" : "neutral";


function InvestigationCard({ inv }: { inv: Investigation }) {
  const { state, update, log, can, user } = useStore();
  const finding = state.findings.find((f) => f.id === inv.findingId);
  const audit = state.audits.find((a) => a.id === finding?.auditId);
  const [note, setNote] = useState("");
  const [evLabel, setEvLabel] = useState("");
  const [evRef, setEvRef] = useState("");
  const [rationale, setRationale] = useState(inv.rationale);
  const [error, setError] = useState<string | null>(null);
  const canEdit = can("openInvestigation");
  const canClose = can("resolveInvestigation");
  const closed = !OPEN_STATUSES.includes(inv.status);
  const history = state.events.filter((e) => e.resource === `investigation:${inv.id}`);

  function patch(changes: Partial<Investigation>, action: string, details: string) {
    const now = new Date().toISOString();
    update((s) => ({
      ...s,
      investigations: s.investigations.map((i) => (i.id === inv.id ? { ...i, ...changes, updatedAt: now } : i)),
      findings: s.findings.map((f) =>
        f.id === inv.findingId && changes.status
          ? { ...f, status: changes.status === "resolved" ? "resolved" : changes.status === "inconclusive" ? "inconclusive" : "investigating" }
          : f,
      ),
    }));
    log(action, `investigation:${inv.id}`, details);
  }

  function addNote() {
    if (!note.trim()) return;
    patch({ notes: [...inv.notes, { author: `${user.name} (${user.role})`, text: note.trim(), at: new Date().toISOString() }] }, "investigation.note_added", note.trim().slice(0, 80));
    setNote("");
  }

  function addEvidence() {
    setError(null);
    const check = safeReference(evRef);
    if (!evLabel.trim() || !check.ok) return setError("Give the evidence a label and a document reference or an https:// link.");
    const item = { id: newId("ev"), label: evLabel.trim().slice(0, 120), reference: evRef.trim().slice(0, 500), addedBy: `${user.name} (${user.role})`, at: new Date().toISOString() };
    patch({ evidence: [...inv.evidence, item] }, "investigation.evidence_added", item.label);
    setEvLabel("");
    setEvRef("");
  }

  function close(status: "resolved" | "inconclusive") {
    setError(null);
    if (status === "resolved" && !inv.resolution) return setError("Choose a resolution before resolving.");
    if (rationale.trim().length < 20) return setError("Write a rationale of at least 20 characters explaining the decision.");
    patch(
      { status, rationale: rationale.trim(), closedBy: `${user.name} (${user.role})`, closedAt: new Date().toISOString() },
      status === "resolved" ? "investigation.resolved" : "investigation.closed_inconclusive",
      `${inv.resolution || "no resolution"} — ${rationale.trim().slice(0, 80)}`,
    );
  }

  if (!finding) return null;
  return (
    <article id={inv.id} className="card scroll-mt-20">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <Badge color={statusColor(inv.status)}>{INVESTIGATION_STATUS_LABEL[inv.status]}</Badge>
      </div>
      <h3 className="mt-2 font-semibold">{finding.title}</h3>
      <p className="text-xs text-ink-2">
        {audit?.jobTitle} · {stageLabel(audit?.result.config.stage ?? "")} · opened {fmtDate(inv.createdAt)} ·{" "}
        <Link className="text-brand underline" href={`/audits/${finding.auditId}#${finding.id}`}>
          view evidence
        </Link>
      </p>
      <FindingExplanation explanation={finding.explanation} />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor={`${inv.id}-owner`}>Owner</label>
          <select id={`${inv.id}-owner`} className="input" disabled={!canEdit || closed} value={inv.owner} onChange={(e) => patch({ owner: e.target.value }, "investigation.assigned", e.target.value)}>
            {USERS.filter((u) => u.role !== "Read-only").map((u) => (
              <option key={u.name} value={u.name}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${inv.id}-status`}>Status</label>
          <select
            id={`${inv.id}-status`}
            className="input"
            disabled={!canEdit || closed}
            value={inv.status}
            onChange={(e) => patch({ status: e.target.value as InvestigationStatus }, "investigation.status_changed", e.target.value)}
          >
            {(closed ? [inv.status] : OPEN_STATUSES).map((s) => (
              <option key={s} value={s}>
                {INVESTIGATION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${inv.id}-res`}>Resolution</label>
          <select
            id={`${inv.id}-res`}
            className="input"
            disabled={!canClose || closed}
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

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="label">Evidence references</div>
          {inv.evidence.length === 0 ? (
            <p className="text-sm text-ink-2">None yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {inv.evidence.map((ev) => {
                const s = safeReference(ev.reference);
                return (
                  <li key={ev.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                    <div className="font-medium">{ev.label}</div>
                    <div className="break-all text-xs text-ink-2">
                      {s.href ? (
                        <a href={s.href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline">
                          {ev.reference}
                        </a>
                      ) : (
                        ev.reference
                      )}{" "}
                      · {ev.addedBy} · {fmtDate(ev.at)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {canEdit && !closed && (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input className="input" placeholder="Label, e.g. Screening config export" value={evLabel} maxLength={120} onChange={(e) => setEvLabel(e.target.value)} aria-label="Evidence label" />
              <input className="input" placeholder="Doc ref or https:// link" value={evRef} maxLength={500} onChange={(e) => setEvRef(e.target.value)} aria-label="Evidence reference" />
              <button className="btn btn-secondary" onClick={addEvidence}>
                Add
              </button>
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted">References only — the demo does not upload files, so no documents with personal data are stored.</p>
        </div>
        <div>
          <div className="label">Reviewer notes</div>
          {inv.notes.length === 0 ? (
            <p className="text-sm text-ink-2">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {inv.notes.map((n, i) => (
                <li key={i} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                  <div className="text-xs text-muted">
                    {n.author} · {fmtDate(n.at)}
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap">{n.text}</div>
                </li>
              ))}
            </ul>
          )}
          {canEdit && !closed && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <textarea className="input min-h-[64px]" placeholder="What did you check, and what did you find?" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} aria-label="Reviewer note" />
              <button className="btn btn-secondary self-start" onClick={addNote} disabled={!note.trim()}>
                Add note
              </button>
            </div>
          )}
        </div>
      </div>

      {!closed ? (
        <div className="mt-5 rounded-lg border border-line bg-surface-2 p-4">
          <label className="label" htmlFor={`${inv.id}-rat`}>Resolution rationale</label>
          <textarea
            id={`${inv.id}-rat`}
            className="input min-h-[72px]"
            disabled={!canClose}
            placeholder="Explain the decision and the evidence it rests on."
            value={rationale}
            maxLength={3000}
            onChange={(e) => setRationale(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canClose ? (
              <>
                <button className="btn btn-primary" onClick={() => close("resolved")}>
                  Sign off &amp; resolve
                </button>
                <button className="btn btn-secondary" onClick={() => close("inconclusive")}>
                  Close as inconclusive
                </button>
              </>
            ) : (
              <Restricted what="close investigations (Reviewer or Admin required)" />
            )}
            {error && <span className="text-sm text-critical">{error}</span>}
          </div>
          <p className="mt-2 text-[11px] text-muted">DeepTrace never marks potential discrimination as confirmed. Closing records a human decision about this finding only.</p>
        </div>
      ) : (
        <div className={`mt-5 rounded-lg border px-4 py-3 text-sm ${inv.status === "resolved" ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <div className="font-medium">
            {inv.status === "resolved" ? `✓ Resolved: ${RESOLUTIONS.find((r) => r.value === inv.resolution)?.label}` : "● Closed as inconclusive"}
          </div>
          <div className="mt-1 whitespace-pre-wrap">{inv.rationale}</div>
          <div className="mt-1 text-xs opacity-80">
            {inv.closedBy} · {inv.closedAt ? fmtDate(inv.closedAt) : ""}
          </div>
        </div>
      )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-2">Audit-event history ({history.length})</summary>
        <ol className="mt-2 space-y-1 border-l border-line pl-4 text-xs">
          {history.map((e) => (
            <li key={e.id}>
              <span className="text-muted">{fmtDate(e.at)}</span> · {e.actor} · <span className="font-mono">{e.action}</span>
              {e.details ? ` — ${e.details}` : ""}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

export default function InvestigationsPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState<"active" | "closed" | "all">("active");
  const pending = state.findings.filter((f) => f.status === "open" && f.severity !== "info" && !state.investigations.some((i) => i.findingId === f.id));
  const list = [...state.investigations]
    .reverse()
    .filter((i) => (filter === "all" ? true : filter === "active" ? OPEN_STATUSES.includes(i.status) : !OPEN_STATUSES.includes(i.status)));

  return (
    <>
      <PageHeader title="Investigation Centre" subtitle="Human review of findings. DeepTrace surfaces evidence; people make, explain and own decisions." />
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
        <>
          <div role="tablist" aria-label="Filter investigations" className="mb-4 inline-flex rounded-lg border border-line bg-surface p-1">
            {(["active", "closed", "all"] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1 text-sm capitalize ${filter === f ? "bg-brand-soft font-medium text-brand" : "text-ink-2"}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="space-y-4">
            {list.length === 0 && <p className="card text-sm text-ink-2">Nothing here.</p>}
            {list.map((inv) => (
              <InvestigationCard key={inv.id} inv={inv} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
