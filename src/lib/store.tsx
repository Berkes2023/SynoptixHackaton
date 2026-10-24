"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WorkflowRun } from "./agents/contracts";
import { PERMISSIONS, USERS, initialState, migrateState, newId, type AuditEvent, type Permission, type Role, type State } from "./state";
import { mergeDocs, toDoc, type WorkspaceDoc } from "./workspace/doc";

export { USERS, PERMISSIONS, INVESTIGATION_STATUS_LABEL, migrateState, initialState, newId } from "./state";
export type { Role, Permission, ImportBatch, AuditRun, FindingStatus, Finding, Resolution, InvestigationStatus, EvidenceRef, Investigation, ExperimentRecord, Report, AuditEvent, Settings, State } from "./state";

const STORAGE_KEY = "deeptrace-demo-v1";

/** The signed-in user, resolved on the server. Present only in cloud mode. */
export interface CloudIdentity {
  userId: string;
  email: string;
  name: string;
  role: Role;
  organisation: { id: string; name: string };
  memberships: { organisationId: string; organisationName: string; role: Role }[];
}

export type SyncStatus = { status: "idle" | "saving" | "saved" } | { status: "error"; message: string };

interface Store {
  state: State;
  ready: boolean;
  /** "local": browser-only demo. "cloud": signed in, stored server-side behind RLS. */
  mode: "local" | "cloud";
  cloud: CloudIdentity | null;
  sync: SyncStatus;
  user: { name: string; role: Role };
  can: (p: Permission) => boolean;
  update: (fn: (s: State) => State) => void;
  log: (action: string, resource: string, details?: string) => void;
  reset: () => void;
  /** Cloud mode: fetch the latest workspace and merge it with unsaved local changes. */
  pull: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface ServerWorkspace {
  version: number;
  doc: WorkspaceDoc;
  organisation: { id: string; name: string };
  me: { name: string; role: Role };
  events: AuditEvent[];
  workflows: WorkflowRun[];
}

export function StoreProvider({ children, cloud = null }: { children: ReactNode; cloud?: CloudIdentity | null }) {
  const [state, setState] = useState<State>(initialState);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus>({ status: "idle" });
  const loaded = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Cloud mode: the last document known to be on the server. */
  const base = useRef<{ version: number; doc: WorkspaceDoc } | null>(null);
  const saving = useRef(false);
  const again = useRef(false);

  const applyServer = useCallback((ws: ServerWorkspace, local: WorkspaceDoc | null) => {
    const prev = base.current;
    const doc = local && prev ? mergeDocs(prev.doc, local, ws.doc) : ws.doc;
    base.current = { version: ws.version, doc: ws.doc };
    setState((s) => ({ ...migrateState({ ...s, ...doc }), role: ws.me.role, organisation: ws.organisation, events: ws.events, workflows: ws.workflows }));
  }, []);

  // Load: from the server when signed in, otherwise from this browser.
  useEffect(() => {
    if (cloud) {
      fetch("/api/v1/workspace", { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Could not load the workspace");
          applyServer((await r.json()) as ServerWorkspace, null);
        })
        .catch((e: Error) => setSync({ status: "error", message: e.message }))
        .finally(() => {
          loaded.current = true;
          setReady(true);
        });
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as State;
        if (parsed.schemaVersion === 1) setState(migrateState(parsed));
      }
    } catch {
      /* storage unavailable: run in-memory */
    }
    loaded.current = true;
    setReady(true);
  }, [cloud, applyServer]);

  /** Cloud mode: write unsaved changes, merging with anyone else's concurrent edits. */
  const flush = useCallback(async () => {
    if (!cloud || !base.current || cloud.role === "Read-only") return;
    if (saving.current) {
      again.current = true;
      return;
    }
    saving.current = true;
    try {
      let local = toDoc(stateRef.current);
      for (let attempt = 0; attempt < 4 && !same(local, base.current.doc); attempt++) {
        setSync({ status: "saving" });
        const b = base.current;
        const res = await fetch("/api/v1/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseVersion: b.version, doc: local }) });
        const body = (await res.json().catch(() => ({}))) as { version?: number; doc?: WorkspaceDoc; error?: string };
        if (res.ok) {
          base.current = { version: body.version!, doc: local };
          setSync({ status: "saved" });
          local = toDoc(stateRef.current);
          continue;
        }
        if (res.status === 409 && body.doc) {
          // Someone else saved first: keep their changes and re-apply ours item by item.
          const merged = mergeDocs(b.doc, toDoc(stateRef.current), body.doc);
          base.current = { version: body.version!, doc: body.doc };
          setState((s) => ({ ...s, ...merged }));
          local = merged;
          continue;
        }
        // Refused (e.g. this role may not change that section): restore the server copy.
        setState((s) => ({ ...s, ...b.doc }));
        setSync({ status: "error", message: body.error ?? "Your change could not be saved" });
        return;
      }
    } catch {
      setSync({ status: "error", message: "Offline — your changes are not saved yet" });
    } finally {
      saving.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, [cloud]);

  // Persist: debounced server save in cloud mode, localStorage otherwise.
  useEffect(() => {
    if (!loaded.current) return;
    if (cloud) {
      const t = window.setTimeout(() => void flush(), 600);
      return () => window.clearTimeout(t);
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, cloud, flush]);

  // Warn before leaving with unsaved server changes.
  useEffect(() => {
    if (!cloud) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      if (base.current && !same(toDoc(stateRef.current), base.current.doc)) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [cloud]);

  const pull = useCallback(async () => {
    if (!cloud) return;
    const r = await fetch("/api/v1/workspace", { cache: "no-store" });
    if (r.ok) applyServer((await r.json()) as ServerWorkspace, toDoc(stateRef.current));
  }, [cloud, applyServer]);

  const user = useMemo(() => (cloud ? { name: cloud.name, role: cloud.role } : USERS.find((u) => u.role === state.role)!), [cloud, state.role]);
  const role = cloud ? cloud.role : state.role;
  const can = useCallback((p: Permission) => (PERMISSIONS[p] as Role[]).includes(role), [role]);
  const update = useCallback((fn: (s: State) => State) => setState(fn), []);
  const log = useCallback(
    (action: string, resource: string, details?: string) => {
      if (cloud) {
        // The server records the event as the signed-in user; the local copy is for immediate display.
        setState((s) => ({ ...s, events: [...s.events, { id: newId("evt"), at: new Date().toISOString(), actor: `${cloud.name} (${cloud.role})`, action, resource, details }] }));
        void fetch("/api/v1/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, resource, details }) }).catch(() => {});
        return;
      }
      setState((s) => {
        const actor = USERS.find((u) => u.role === s.role)!;
        // Append-only: events are never edited or removed (except by a full demo reset).
        return { ...s, events: [...s.events, { id: newId("evt"), at: new Date().toISOString(), actor: `${actor.name} (${actor.role})`, action, resource, details }] };
      });
    },
    [cloud],
  );
  // Resetting only exists for the browser demo; organisation data is never wiped from the client.
  const reset = useCallback(() => {
    if (!cloud) setState(initialState());
  }, [cloud]);

  return <Ctx.Provider value={{ state, ready, mode: cloud ? "cloud" : "local", cloud, sync, user, can, update, log, reset, pull }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
