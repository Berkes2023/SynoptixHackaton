"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { Icon, Logo } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { BUILD_ID } from "./VersionGuard";
import { APP_NAV } from "@/lib/site/nav";
import { USERS, useStore, type Role } from "@/lib/store";

const SECTIONS = ["Audit", "Governance", "Workspace"] as const;

const CRUMB_LABELS: Record<string, string> = {
  dashboard: "Overview",
  imports: "Data Hub",
  jobs: "Jobs",
  audits: "Audit Lab",
  new: "New audit",
  "fairness-lab": "Counterfactual Studio",
  investigations: "Investigations",
  reports: "Reports",
  drift: "Bias Drift",
  agents: "Agent Observatory",
  settings: "Settings",
};

function Breadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="text-ink-2">Workspace</li>
        {parts.map((p, i) => {
          const href = "/" + parts.slice(0, i + 1).join("/");
          const label = CRUMB_LABELS[p] ?? decodeURIComponent(p);
          const last = i === parts.length - 1;
          return (
            <li key={href} className="flex min-w-0 items-center gap-1.5">
              <Icon name="chevronRight" className="h-3.5 w-3.5 flex-none text-muted" />
              {last ? (
                <span aria-current="page" className="truncate font-medium">
                  {label}
                </span>
              ) : (
                <Link href={href} className="truncate text-ink-2 hover:text-ink">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ShellSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading workspace" className="space-y-6">
      <div className="skeleton h-8 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
      <div className="skeleton h-64" />
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, update, log, ready } = useStore();
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const isReport = /^\/reports\/[^/]+$/.test(pathname);
  const openFindings = state.findings.filter((f) => f.status !== "resolved" && f.status !== "inconclusive" && f.severity !== "info").length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  const setRole = (role: Role) => {
    update((s) => ({ ...s, role }));
    log("session.role_switched", `role:${role}`, "Demo role switch — production uses OIDC identities and server-side RBAC");
  };

  const nav = (
    <nav aria-label="Workspace" className="flex flex-col gap-5 px-3">
      {SECTIONS.map((section) => (
        <div key={section}>
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{section}</div>
          <ul className="space-y-0.5">
            {APP_NAV.filter((n) => n.section === section).map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? "bg-brand-soft font-medium text-brand" : "text-ink-2 hover:bg-sunken hover:text-ink"}`}
                  >
                    <Icon name={item.icon} className="h-4 w-4" />
                    {item.label}
                    {item.href === "/investigations" && openFindings > 0 && (
                      <span className="tabular ml-auto rounded-full bg-red-50 px-1.5 text-[11px] font-semibold text-red-800">{openFindings}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:flex-none lg:flex-col">
        <div className="flex items-center gap-2 px-5 py-4">
          <Link href="/" className="flex items-center gap-2" aria-label="DeepTrace home">
            <Logo size={24} />
            <span className="font-semibold tracking-tight">DeepTrace</span>
          </Link>
        </div>
        <div className="px-3 pb-4">
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            <Icon name="search" className="h-4 w-4" /> Search
            <kbd className="ml-auto rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-line px-5 py-4 text-[11px] leading-relaxed text-muted">
          Read-only with respect to external ATS systems. DeepTrace never rejects candidates or alters scores.
          <div className="mt-2 font-mono">Version {BUILD_ID}</div>
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Workspace navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="animate-in absolute inset-y-0 left-0 w-72 overflow-y-auto bg-surface py-4 shadow-pop">
            <div className="mb-4 flex items-center justify-between px-5">
              <span className="flex items-center gap-2 font-semibold">
                <Logo size={22} /> DeepTrace
              </span>
              <button className="btn btn-ghost px-2" aria-label="Close navigation" onClick={() => setDrawer(false)} autoFocus>
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-plane/85 px-4 py-2.5 backdrop-blur-md sm:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button className="btn btn-ghost px-2 lg:hidden" aria-label="Open navigation" onClick={() => setDrawer(true)}>
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <Breadcrumbs pathname={pathname} />
          </div>
          <div className="flex flex-none items-center gap-1.5">
            <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 md:inline">Synthetic demo data</span>
            <button className="btn btn-ghost px-2 lg:hidden" aria-label="Search" onClick={() => setPalette(true)}>
              <Icon name="search" className="h-4 w-4" />
            </button>
            <ThemeToggle />
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <span className="hidden sm:inline">Acting as</span>
              <select className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-sm text-ink" value={state.role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Demo role">
                {USERS.map((u) => (
                  <option key={u.role} value={u.role}>
                    {u.name} — {u.role}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <main id="main" className={isReport ? "px-4 py-6 sm:px-8" : "mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8"}>
          {ready ? <div className="animate-in">{children}</div> : <ShellSkeleton />}
        </main>
      </div>
      {ready && <CommandPalette open={palette} onClose={() => setPalette(false)} />}
    </div>
  );
}
