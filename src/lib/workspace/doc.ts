import type { Role, State } from "../state";

/**
 * The part of the workspace stored server-side as one document per
 * organisation. Identity (role, organisation) comes from the session,
 * workflows and the audit log live in their own tables.
 */
export type WorkspaceDoc = Omit<State, "role" | "organisation" | "workflows" | "events">;

export const DOC_SECTIONS = ["records", "imports", "audits", "findings", "investigations", "reports", "experiments", "settings", "onboardingDismissed"] as const;
export type DocSection = (typeof DOC_SECTIONS)[number];

/** Which roles may change each section. Mirrors PERMISSIONS in the store. */
export const SECTION_WRITERS: Record<DocSection, Role[]> = {
  records: ["Admin", "Auditor"],
  imports: ["Admin", "Auditor"],
  audits: ["Admin", "Auditor"],
  findings: ["Admin", "Auditor", "Reviewer"],
  investigations: ["Admin", "Auditor", "Reviewer"],
  reports: ["Admin", "Auditor"],
  experiments: ["Admin", "Auditor"],
  settings: ["Admin"],
  onboardingDismissed: ["Admin", "Auditor", "Reviewer"],
};

/** Bytes; keeps one organisation's document comfortably inside a single row. */
export const MAX_DOC_BYTES = 5_000_000;

export function toDoc(s: State): WorkspaceDoc {
  const { role: _r, organisation: _o, workflows: _w, events: _e, ...doc } = s;
  return doc;
}

export const emptyDoc = (initial: State): WorkspaceDoc => toDoc(initial);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Entity = object;
/** Stable identity per item: screening records are keyed by application and stage. */
const keyOf = (x: Entity): string => {
  const r = x as { id?: string; applicationId?: string; stage?: string };
  return r.id ?? `${r.applicationId}|${r.stage}`;
};
const ids = (xs: Entity[]) => new Set(xs.map(keyOf));

/**
 * Returns the reason a change is not allowed for this role, or null.
 * Run on the server against the stored document before every write.
 */
export function checkWrite(role: Role, before: WorkspaceDoc, after: WorkspaceDoc): string | null {
  for (const section of DOC_SECTIONS) {
    if (same(before[section], after[section])) continue;
    if (!SECTION_WRITERS[section].includes(role)) return `${role} may not change ${section}`;
  }
  // Deleting candidate records or import batches is an Admin action.
  const removed = (k: "records" | "imports" | "audits" | "reports") => {
    const now = ids(after[k] as Entity[]);
    return (before[k] as Entity[]).some((x) => !now.has(keyOf(x)));
  };
  if (role !== "Admin" && (["records", "imports", "audits", "reports"] as const).some(removed)) return "Only Admins may delete data";
  // Closing an investigation is a Reviewer/Admin decision, and closed ones stay closed for everyone else.
  const prev = new Map(before.investigations.map((i) => [i.id, i]));
  for (const inv of after.investigations) {
    const old = prev.get(inv.id);
    const closedNow = (inv.status === "resolved" || inv.status === "inconclusive") && old?.status !== inv.status;
    if (closedNow && role !== "Admin" && role !== "Reviewer") return "Only Reviewers or Admins may close an investigation";
  }
  if (new TextEncoder().encode(JSON.stringify(after)).length > MAX_DOC_BYTES) return "Workspace is too large";
  return null;
}

function mergeById<T extends Entity>(base: T[], local: T[], server: T[]): T[] {
  const b = new Map(base.map((x) => [keyOf(x), x]));
  const l = new Map(local.map((x) => [keyOf(x), x]));
  const out: T[] = [];
  for (const s of server) {
    const inBase = b.get(keyOf(s));
    const mine = l.get(keyOf(s));
    if (!mine) {
      // Deleted locally (was in base) → drop; added by someone else → keep.
      if (!inBase) out.push(s);
      continue;
    }
    // Changed locally → local wins for that item; otherwise take the server copy.
    out.push(inBase && !same(inBase, mine) ? mine : inBase ? s : mine);
  }
  const serverIds = ids(server);
  for (const mine of local) if (!serverIds.has(keyOf(mine)) && !b.has(keyOf(mine))) out.push(mine);
  return out;
}

/**
 * Three-way merge after a concurrent write: keep everything the other person
 * changed and re-apply ours on top, item by item.
 */
export function mergeDocs(base: WorkspaceDoc, local: WorkspaceDoc, server: WorkspaceDoc): WorkspaceDoc {
  const out = { ...server } as WorkspaceDoc;
  for (const section of DOC_SECTIONS) {
    const l = local[section];
    if (same(base[section], l)) continue;
    if (Array.isArray(l)) (out as Record<string, unknown>)[section] = mergeById(base[section] as Entity[], l as Entity[], server[section] as Entity[]);
    else (out as Record<string, unknown>)[section] = l;
  }
  return out;
}
