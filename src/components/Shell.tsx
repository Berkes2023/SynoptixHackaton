"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { USERS, useStore, type Role } from "@/lib/store";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/imports", label: "Data Hub" },
  { href: "/jobs", label: "Jobs" },
  { href: "/audits", label: "Audit Lab" },
  { href: "/fairness-lab", label: "Counterfactual Lab" },
  { href: "/investigations", label: "Investigations" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#1c5cab" />
        <path d="M9 22 L14 14 L18 18 L23 9" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="23" cy="9" r="2.2" fill="#86b6ef" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">DeepTrace</span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, update, log, ready } = useStore();
  const isReport = /^\/reports\/[^/]+$/.test(pathname);

  const setRole = (role: Role) => {
    update((s) => ({ ...s, role }));
    log("session.role_switched", `role:${role}`, "Demo role switch — production uses OIDC identities and RBAC");
  };

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print border-b border-line bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:flex-none lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:px-5 lg:py-5">
          <Logo />
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 lg:hidden">Demo data</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${active ? "bg-brand-soft font-medium text-brand" : "text-ink-2 hover:bg-plane hover:text-ink"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden px-5 pt-6 text-[11px] leading-relaxed text-muted lg:block">
          Read-only with respect to external ATS systems. DeepTrace never rejects candidates or alters scores.
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white/90 px-4 py-2.5 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate text-ink-2">{state.organisation.name}</span>
            <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 lg:inline">Synthetic demo data</span>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            Acting as
            <select className="rounded-md border border-line bg-white px-2 py-1 text-sm text-ink" value={state.role} onChange={(e) => setRole(e.target.value as Role)}>
              {USERS.map((u) => (
                <option key={u.role} value={u.role}>
                  {u.name} — {u.role}
                </option>
              ))}
            </select>
          </label>
        </header>
        <main className={isReport ? "px-4 py-6 sm:px-8" : "mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8"}>
          {ready ? children : <div className="py-20 text-center text-sm text-muted">Loading workspace…</div>}
        </main>
      </div>
    </div>
  );
}
