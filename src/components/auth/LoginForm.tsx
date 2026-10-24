"use client";

import Link from "next/link";
import { useState } from "react";

type Mode = "sign-in" | "sign-up" | "magic-link";

const TITLES: Record<Mode, string> = { "sign-in": "Sign in", "sign-up": "Create an account", "magic-link": "Email me a sign-in link" };

export function LoginForm({ configured, next, linkError }: { configured: boolean; next: string; linkError: boolean }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? "That link is invalid or has expired. Request a new one." : null);
  const [notice, setNotice] = useState<string | null>(null);

  async function openDemo() {
    await fetch("/api/auth/local-demo", { method: "POST" });
    window.location.assign(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, next }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; next?: string; confirm?: boolean };
      if (!res.ok) return setError(body.error ?? "Something went wrong");
      if (mode === "sign-in") return window.location.assign(body.next ?? next);
      if (mode === "sign-up") {
        if (!body.confirm) return window.location.assign("/onboarding");
        setNotice("Check your inbox to confirm your email address, then continue from the link.");
      } else setNotice("If an account exists for that address, a sign-in link is on its way.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">Accounts are not enabled here</h1>
        <p className="text-sm text-ink-2">
          This deployment runs DeepTrace as a browser-only demo: your workspace stays in this browser and nothing is sent to a server. Accounts, shared workspaces and
          server-side storage are switched on when the deployment is connected to a database.
        </p>
        <Link href="/dashboard" className="btn btn-primary">
          Open the demo workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form className="card space-y-4" onSubmit={submit} noValidate>
        <h1 className="text-xl font-semibold">{TITLES[mode]}</h1>
        <div>
          <label className="label" htmlFor="email">
            Work email
          </label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== "magic-link" && (
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              minLength={mode === "sign-up" ? 10 : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "sign-up" && <p className="mt-1 text-xs text-muted">At least 10 characters.</p>}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-ink">
            {notice}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Please wait…" : TITLES[mode]}
        </button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          {mode !== "sign-in" && (
            <button type="button" className="text-brand hover:underline" onClick={() => setMode("sign-in")}>
              Sign in with a password
            </button>
          )}
          {mode !== "sign-up" && (
            <button type="button" className="text-brand hover:underline" onClick={() => setMode("sign-up")}>
              Create an account
            </button>
          )}
          {mode !== "magic-link" && (
            <button type="button" className="text-brand hover:underline" onClick={() => setMode("magic-link")}>
              Email me a link instead
            </button>
          )}
        </div>
      </form>
      <div className="card flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-ink-2">Just exploring? The demo keeps everything in your browser.</span>
        <button type="button" className="btn btn-secondary" onClick={openDemo}>
          Use the local demo
        </button>
      </div>
    </div>
  );
}
