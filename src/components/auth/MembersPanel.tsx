"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, fmtDate } from "@/components/ui";
import { useStore, type Role } from "@/lib/store";

const ROLES: Role[] = ["Admin", "Auditor", "Reviewer", "Read-only"];

interface Member {
  userId: string;
  role: Role;
  displayName: string;
  since: string;
}
interface Invitation {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}

/** Signed-in mode: the organisation's real members and invitations. Admin actions are enforced server-side and by RLS. */
export function MembersPanel() {
  const { cloud, pull } = useStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Auditor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = cloud?.role === "Admin";

  const load = useCallback(async () => {
    const r = await fetch("/api/v1/members", { cache: "no-store" });
    if (!r.ok) return setError("Could not load members");
    const b = (await r.json()) as { members: Member[]; invitations: Invitation[] };
    setMembers(b.members);
    setInvitations(b.invitations);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(method: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/members", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Request failed");
        return false;
      }
      await Promise.all([load(), pull()]);
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-6">
      <h2 className="text-sm font-semibold">Members of {cloud?.organisation.name}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="table text-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Member since</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const me = m.userId === cloud?.userId;
              return (
                <tr key={m.userId}>
                  <td>
                    {m.displayName}
                    {me && <span className="ml-1 text-xs text-muted">(you)</span>}
                  </td>
                  <td>
                    {isAdmin && !me ? (
                      <select className="input py-1" aria-label={`Role for ${m.displayName}`} value={m.role} disabled={busy} onChange={(e) => call("PATCH", { userId: m.userId, role: e.target.value })}>
                        {ROLES.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge color={me ? "brand" : "neutral"}>{m.role}</Badge>
                    )}
                  </td>
                  <td className="text-xs text-ink-2">{fmtDate(m.since)}</td>
                  {isAdmin && (
                    <td>
                      {!me && (
                        <button
                          className="btn btn-ghost px-2 text-xs text-critical"
                          disabled={busy}
                          onClick={() => window.confirm(`Remove ${m.displayName} from the organisation?`) && call("DELETE", { userId: m.userId })}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <>
          {invitations.length > 0 && (
            <div className="mt-4">
              <h3 className="label">Pending invitations</h3>
              <ul className="space-y-1 text-sm">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span>
                      {i.email} · {i.role}
                    </span>
                    <button className="btn btn-ghost px-2 text-xs" disabled={busy} onClick={() => call("DELETE", { invitationId: i.id })}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await call("POST", { email, role })) setEmail("");
            }}
          >
            <div className="min-w-[14rem] flex-1">
              <label className="label" htmlFor="invite-email">
                Invite by email
              </label>
              <input id="invite-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="invite-role">
                Role
              </label>
              <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              Invite
            </button>
          </form>
          <p className="mt-2 text-xs text-ink-2">
            Invitees create an account with that address (or sign in); they join after confirming their email. No email is sent by DeepTrace itself — tell them to sign up.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
