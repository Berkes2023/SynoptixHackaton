"use client";

import { useState } from "react";
import { Badge, PageHeader, Restricted, attrLabel, fmtDate } from "@/components/ui";
import { SUPPORTED_AUDIT_ATTRIBUTES } from "@/lib/fairness/audit";
import { PERMISSIONS, USERS, initialState, useStore, type Settings } from "@/lib/store";

export default function SettingsPage() {
  const { state, update, log, can, reset } = useStore();
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [saved, setSaved] = useState(false);
  const canManage = can("managePolicies");

  function save() {
    const clean: Settings = {
      ...draft,
      minimumGroupSize: Math.max(5, Math.min(1000, Math.round(draft.minimumGroupSize))),
      impactThreshold: Math.max(0.5, Math.min(0.99, draft.impactThreshold)),
      alpha: Math.max(0.001, Math.min(0.2, draft.alpha)),
    };
    update((s) => ({ ...s, settings: clean }));
    log("policy.updated", "settings:audit-policy", JSON.stringify(clean));
    setDraft(clean);
    setSaved(true);
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Audit policies, users and the append-only audit trail." />

      <section className="card mb-6">
        <h2 className="text-sm font-semibold">Audit policy</h2>
        {!canManage && (
          <div className="mt-2">
            <Restricted what="change audit policies (Admin only)" />
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="mg">Min group size</label>
            <input id="mg" type="number" className="input" disabled={!canManage} value={draft.minimumGroupSize} onChange={(e) => setDraft({ ...draft, minimumGroupSize: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="cl">Default confidence</label>
            <select id="cl" className="input" disabled={!canManage} value={draft.confidenceLevel} onChange={(e) => setDraft({ ...draft, confidenceLevel: Number(e.target.value) })}>
              {[0.9, 0.95, 0.99].map((c) => (
                <option key={c} value={c}>
                  {c * 100}%
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="it">Impact heuristic</label>
            <input id="it" type="number" step="0.05" className="input" disabled={!canManage} value={draft.impactThreshold} onChange={(e) => setDraft({ ...draft, impactThreshold: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="al">α (Holm)</label>
            <input id="al" type="number" step="0.01" className="input" disabled={!canManage} value={draft.alpha} onChange={(e) => setDraft({ ...draft, alpha: Number(e.target.value) })} />
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="label">Authorised audit categories (lawful basis recorded)</legend>
          <div className="flex flex-wrap gap-4">
            {SUPPORTED_AUDIT_ATTRIBUTES.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={draft.authorisedAttributes.includes(a)}
                  onChange={(e) =>
                    setDraft({ ...draft, authorisedAttributes: e.target.checked ? [...draft.authorisedAttributes, a] : draft.authorisedAttributes.filter((x) => x !== a) })
                  }
                />
                {attrLabel(a)}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-2">The API rejects audits on categories that are not authorised here (HTTP 403).</p>
        </fieldset>
        {canManage && (
          <div className="mt-4 flex items-center gap-3">
            <button className="btn btn-primary" onClick={save}>
              Save policy
            </button>
            {saved && <span className="text-sm text-green-800">✓ Saved and logged</span>}
          </div>
        )}
      </section>

      <section className="card mb-6">
        <h2 className="text-sm font-semibold">Users &amp; roles (fictional)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="table text-sm">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {USERS.map((u) => (
                <tr key={u.role}>
                  <td>{u.name}</td>
                  <td>
                    <Badge color={u.role === state.role ? "brand" : "neutral"}>{u.role}</Badge>
                  </td>
                  <td className="text-xs text-ink-2">
                    {Object.entries(PERMISSIONS)
                      .filter(([, roles]) => (roles as string[]).includes(u.role))
                      .map(([p]) => p.replace(/([A-Z])/g, " $1").toLowerCase())
                      .join(", ") || "view only"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-2">Demo role switching stands in for OIDC sign-in with MFA for privileged users.</p>
      </section>

      <section className="card mb-6">
        <h2 className="text-sm font-semibold">Audit trail ({state.events.length} events, append-only)</h2>
        <div className="mt-3 max-h-96 overflow-auto">
          <table className="table text-xs">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {[...state.events].reverse().map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtDate(e.at)}</td>
                  <td>{e.actor}</td>
                  <td className="font-mono">{e.action}</td>
                  <td className="font-mono">{e.resource}</td>
                  <td className="max-w-xs truncate text-ink-2" title={e.details}>
                    {e.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card border-red-200">
        <h2 className="text-sm font-semibold">Reset demo workspace</h2>
        <p className="mt-1 text-sm text-ink-2">Clears all records, audits, investigations, reports and events stored in this browser.</p>
        <button
          className="btn btn-secondary mt-3 text-critical"
          onClick={() => {
            if (window.confirm("Reset the demo workspace? This cannot be undone.")) {
              reset();
              setDraft(initialState().settings);
            }
          }}
        >
          Reset demo data
        </button>
      </section>
    </>
  );
}
