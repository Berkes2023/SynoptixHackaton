import { WorkflowRunSchema, type WorkflowRun } from "../agents/contracts";
import { migrateState, type State } from "../state";
import { toDoc, type WorkspaceDoc } from "../workspace/doc";
import { appendEvent, type ActiveSession } from "./session";
import type { Caller, WorkflowStore } from "./workflow-service";

export const callerOf = (s: ActiveSession): Caller => ({ id: s.userId, name: s.active.displayName, role: s.active.role, organisationId: s.active.organisationId });

/** Normalise a stored document (possibly from an older version) to the current shape. */
export function normaliseDoc(raw: unknown): WorkspaceDoc {
  return toDoc(migrateState((raw ?? {}) as Partial<State>));
}

/** Workflow persistence through the user's own Supabase session, so RLS applies to every call. */
export function supabaseStore(s: ActiveSession): WorkflowStore {
  const org = s.active.organisationId;
  const db = s.supabase;
  return {
    async loadWorkspace() {
      const { data, error } = await db.from("workspaces").select("state, version").eq("organisation_id", org).single();
      if (error || !data) throw new Error("Workspace unavailable");
      return { version: data.version as number, doc: normaliseDoc(data.state) };
    },
    async saveWorkspace(version, doc) {
      const { data, error } = await db.from("workspaces").update({ state: doc, updated_by: s.userId }).eq("organisation_id", org).eq("version", version).select("version");
      if (error) throw new Error(error.message);
      return (data ?? []).length === 1;
    },
    async getRun(id) {
      const { data } = await db.from("workflows").select("run").eq("organisation_id", org).eq("id", id).maybeSingle();
      return data ? WorkflowRunSchema.parse(data.run) : null;
    },
    async insertRun(run: WorkflowRun) {
      const { error } = await db.from("workflows").insert({ id: run.id, organisation_id: org, created_by: s.userId, state: run.state, run });
      if (error) throw new Error(error.message);
    },
    async updateRun(run: WorkflowRun) {
      const { error } = await db.from("workflows").update({ state: run.state, run }).eq("organisation_id", org).eq("id", run.id);
      if (error) throw new Error(error.message);
    },
    event: (action, resource, details) => appendEvent(s, action, resource, details),
  };
}
