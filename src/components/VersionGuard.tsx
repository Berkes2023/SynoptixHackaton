"use client";

import { useEffect, useState } from "react";

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "local";

/**
 * A tab left open across a deployment keeps running the old JavaScript.
 * This checks the server's build ID when the tab regains focus (and every
 * five minutes) and offers a reload when a newer version is live.
 */
export function VersionGuard() {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (BUILD_ID === "local") return;
    let stopped = false;
    async function check() {
      try {
        const res = await fetch("/api/v1/health", { cache: "no-store" });
        const body = await res.json();
        if (!stopped && typeof body.build === "string" && body.build !== "local" && body.build !== BUILD_ID) setLatest(body.build);
      } catch {
        /* offline or blocked: try again later */
      }
    }
    const onVisible = () => document.visibilityState === "visible" && check();
    check();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 5 * 60_000);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!latest) return null;
  return (
    <div role="status" className="no-print fixed inset-x-0 bottom-4 z-[70] mx-auto flex w-[calc(100%-2rem)] max-w-lg items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-pop">
      <span>A new version of DeepTrace is available.</span>
      <button className="btn btn-primary px-3 py-1.5" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
