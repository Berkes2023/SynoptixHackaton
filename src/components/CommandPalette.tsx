"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { APP_NAV } from "@/lib/site/nav";
import { useStore } from "@/lib/store";

interface Command {
  id: string;
  label: string;
  hint: string;
  group: "Navigate" | "Jobs" | "Audits" | "Findings" | "Reports" | "Actions";
  icon: IconName;
  href: string;
}

/**
 * ⌘K / Ctrl+K palette. Results come only from the current workspace and are
 * filtered by the active role's permissions (e.g. no "Run audit" for Read-only).
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, can } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = APP_NAV.map((n) => ({ id: `nav:${n.href}`, label: n.label, hint: "Go to", group: "Navigate", icon: n.icon, href: n.href }));
    if (can("importData")) list.push({ id: "act:import", label: "Import a dataset", hint: "Action", group: "Actions", icon: "upload", href: "/imports" });
    if (can("runAudit")) list.push({ id: "act:audit", label: "Run a new audit", hint: "Action", group: "Actions", icon: "chart", href: "/audits/new" });
    list.push({ id: "act:demo", label: "Open guided demo", hint: "Action", group: "Actions", icon: "play", href: "/demo" });
    const jobs = new Map<string, string>();
    for (const r of state.records) jobs.set(r.jobRef, r.jobTitle);
    for (const [ref, title] of jobs) list.push({ id: `job:${ref}`, label: `${title} (${ref})`, hint: "Job", group: "Jobs", icon: "briefcase", href: `/jobs/${encodeURIComponent(ref)}` });
    for (const a of state.audits)
      list.push({ id: `aud:${a.id}`, label: `${a.jobTitle} · ${a.result.config.stage.replace(/_/g, " ")} · ${a.result.config.groupingAttribute}`, hint: "Audit", group: "Audits", icon: "chart", href: `/audits/${a.id}` });
    for (const f of state.findings) list.push({ id: `fnd:${f.id}`, label: f.title, hint: f.severity, group: "Findings", icon: "alert", href: `/audits/${f.auditId}#${f.id}` });
    for (const r of state.reports) list.push({ id: `rpt:${r.id}`, label: `Report ${r.id}`, hint: "Report", group: "Reports", icon: "file", href: `/reports/${r.id}` });
    return list;
  }, [state, can]);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((c) => terms.every((t) => `${c.label} ${c.group} ${c.hint}`.toLowerCase().includes(t))).slice(0, 30);
  }, [commands, q]);

  useEffect(() => {
    if (open) {
      restoreFocus.current = document.activeElement as HTMLElement;
      setQ("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else restoreFocus.current?.focus?.();
  }, [open]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  function go(c: Command | undefined) {
    if (!c) return;
    onClose();
    router.push(c.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-in w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, jobs, audits, findings, reports…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-${active}` : undefined}
          />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul id="cmdk-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-2">No matches in this workspace.</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {header && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{header}</div>}
                <div
                  id={`cmdk-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(c)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-brand-soft text-ink" : "text-ink-2"}`}
                >
                  <Icon name={c.icon} className="h-4 w-4 flex-none" />
                  <span className="truncate">{c.label}</span>
                  <span className="ml-auto flex-none text-[11px] text-muted">{c.hint}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Results respect your role and this workspace only</span>
        </div>
      </div>
    </div>
  );
}
