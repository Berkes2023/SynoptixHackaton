"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Logo } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FEATURED_CTA, MEGA_MENU } from "@/lib/site/nav";

export function MarketingNav() {
  const [open, setOpen] = useState<number | null>(null);
  const [mobile, setMobile] = useState(false);
  const [mobileSection, setMobileSection] = useState<number | null>(0);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFirst = useRef(false);

  // After the panel renders, move focus into it when it was opened from the keyboard.
  useEffect(() => {
    if (open == null || !focusFirst.current) return;
    focusFirst.current = false;
    navRef.current?.querySelector<HTMLAnchorElement>(`#mega-${open} a`)?.focus();
  }, [open]);

  const close = useCallback((refocus?: number | null) => {
    setOpen(null);
    if (refocus != null) triggers.current[refocus]?.focus();
  }, []);

  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (open != null) close(open);
      if (mobile) setMobile(false);
    }
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, mobile, close]);

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobile]);

  const hoverOpen = (i: number) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(i);
  };
  const hoverClose = () => {
    closeTimer.current = setTimeout(() => setOpen(null), 120);
  };

  function onTriggerKey(e: React.KeyboardEvent, i: number) {
    if (e.key === "ArrowDown" || ((e.key === "Enter" || e.key === " ") && open !== i)) {
      e.preventDefault();
      focusFirst.current = true;
      setOpen(i);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = (i + (e.key === "ArrowRight" ? 1 : -1) + MEGA_MENU.length) % MEGA_MENU.length;
      triggers.current[next]?.focus();
    }
  }

  function onPanelKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const links = [...(navRef.current?.querySelectorAll<HTMLAnchorElement>(`#mega-${i} a`) ?? [])];
    const idx = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = e.key === "ArrowDown" ? Math.min(links.length - 1, idx + 1) : idx - 1;
    if (next < 0) triggers.current[i]?.focus();
    else links[next]?.focus();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-plane/85 backdrop-blur-md">
      <nav ref={navRef} aria-label="Main" className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="DeepTrace home">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">DeepTrace</span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {MEGA_MENU.map((group, i) => (
            <li key={group.label} onMouseEnter={() => hoverOpen(i)} onMouseLeave={hoverClose}>
              <button
                ref={(el) => {
                  triggers.current[i] = el;
                }}
                type="button"
                className={`btn btn-ghost px-3 ${open === i ? "bg-sunken text-ink" : ""}`}
                aria-expanded={open === i}
                aria-controls={`mega-${i}`}
                onClick={() => setOpen(open === i ? null : i)}
                onKeyDown={(e) => onTriggerKey(e, i)}
              >
                {group.label}
                <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
            </li>
          ))}
          <li>
            <Link href="/research" className="btn btn-ghost px-3">
              Research
            </Link>
          </li>
        </ul>

        {open != null && (
          <div
            id={`mega-${open}`}
            role="region"
            aria-label={`${MEGA_MENU[open].label} menu`}
            className="animate-in absolute inset-x-4 top-[calc(100%+6px)] hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-pop sm:inset-x-6 lg:block"
            onMouseEnter={() => hoverOpen(open)}
            onMouseLeave={hoverClose}
            onKeyDown={(e) => onPanelKey(e, open)}
          >
            <div className="grid grid-cols-[1fr_300px]">
              <div className="p-6">
                <div className="eyebrow mb-3">{MEGA_MENU[open].label}</div>
                <ul className="grid grid-cols-2 gap-1">
                  {MEGA_MENU[open].items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} onClick={() => setOpen(null)} className="group flex gap-3 rounded-lg p-3 hover:bg-sunken focus-visible:bg-sunken">
                        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-line bg-surface-2 text-brand">
                          <Icon name={item.icon} />
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-ink">{item.label}</span>
                          <span className="block text-xs text-ink-2">{item.description}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-l border-line bg-sunken p-6">
                <div className="eyebrow mb-2">Featured</div>
                <div className="text-base font-semibold">{FEATURED_CTA.title}</div>
                <p className="mt-2 text-sm text-ink-2">{FEATURED_CTA.body}</p>
                <Link href={FEATURED_CTA.href} onClick={() => setOpen(null)} className="btn btn-primary mt-4">
                  {FEATURED_CTA.cta} <Icon name="arrowRight" />
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link href="/dashboard" className="btn btn-ghost hidden sm:inline-flex">
            Open app
          </Link>
          <Link href="/demo" className="btn btn-primary hidden sm:inline-flex">
            Launch demo
          </Link>
          <button type="button" className="btn btn-ghost px-2 lg:hidden" aria-label="Open menu" aria-expanded={mobile} aria-controls="mobile-nav" onClick={() => setMobile(true)}>
            <Icon name="menu" className="h-5 w-5" />
          </button>
        </div>
      </nav>

      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobile(false)} />
          <div id="mobile-nav" className="animate-in absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto bg-surface shadow-pop">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <span className="flex items-center gap-2 font-semibold">
                <Logo size={22} /> DeepTrace
              </span>
              <button type="button" className="btn btn-ghost px-2" aria-label="Close menu" onClick={() => setMobile(false)} autoFocus>
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 px-2 py-2">
              {MEGA_MENU.map((group, i) => (
                <div key={group.label} className="border-b border-line">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-3 text-sm font-semibold"
                    aria-expanded={mobileSection === i}
                    onClick={() => setMobileSection(mobileSection === i ? null : i)}
                  >
                    {group.label}
                    <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${mobileSection === i ? "rotate-180" : ""}`} />
                  </button>
                  {mobileSection === i && (
                    <ul className="pb-2">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <Link href={item.href} onClick={() => setMobile(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sunken">
                            <Icon name={item.icon} className="h-4 w-4 text-brand" />
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <Link href="/research" onClick={() => setMobile(false)} className="block px-3 py-3 text-sm font-semibold">
                Research
              </Link>
            </div>
            <div className="grid gap-2 border-t border-line p-4">
              <Link href="/demo" onClick={() => setMobile(false)} className="btn btn-primary">
                Launch Interactive Demo
              </Link>
              <Link href="/dashboard" onClick={() => setMobile(false)} className="btn btn-secondary">
                Open app
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
