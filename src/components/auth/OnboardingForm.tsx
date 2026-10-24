"use client";

import { useState } from "react";

export function OnboardingForm({ email }: { email: string }) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_organisation", name, displayName }) });
    if (res.ok) return window.location.assign("/dashboard");
    setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not create the organisation");
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <form className="card space-y-4" onSubmit={submit}>
        <h1 className="text-xl font-semibold">Set up your organisation</h1>
        <p className="text-sm text-ink-2">You will be its Admin. Its workspace is private to the people you invite.</p>
        <div>
          <label className="label" htmlFor="org">
            Organisation name
          </label>
          <input id="org" className="input" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="me">
            Your name (shown in the audit log)
          </label>
          <input id="me" className="input" required maxLength={120} autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Creating…" : "Create organisation"}
        </button>
      </form>
      <div className="card space-y-2 text-sm text-ink-2">
        <p>
          Joining a colleague&apos;s organisation instead? Ask an Admin to invite <strong className="text-ink">{email}</strong>, then reload this page.
        </p>
        <button
          type="button"
          className="text-brand hover:underline"
          onClick={async () => {
            await fetch("/api/auth/sign-out", { method: "POST" });
            window.location.assign("/login");
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
