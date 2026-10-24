import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real migration on Postgres (PGlite) with a minimal stand-in for
 * Supabase's auth schema, then exercises the policies as the `authenticated`
 * role with different JWT claims — the same mechanism Supabase uses.
 */
const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
-- Supabase grants table privileges by default; policies decide what is visible.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

const ALICE = "00000000-0000-0000-0000-00000000000a"; // Admin of org A
const BOB = "00000000-0000-0000-0000-00000000000b"; // Auditor in org A
const RITA = "00000000-0000-0000-0000-00000000000c"; // Reviewer in org A
const MALLORY = "00000000-0000-0000-0000-00000000000d"; // Admin of org B
const VERA = "00000000-0000-0000-0000-00000000000e"; // Read-only in org A

let db: PGlite;
let orgA: string;
let orgB: string;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  const email = user ? `${user.slice(-1)}@example.test` : "";
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [user ? JSON.stringify({ sub: user, email, role: "authenticated" }) : ""]);
    await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
    return (await tx.query<T>(sql, params)).rows;
  });
}

const fails = async (p: Promise<unknown>, match?: RegExp) => {
  let err: unknown = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err, "expected the statement to be refused").not.toBeNull();
  if (match) expect(String((err as Error).message)).toMatch(match);
};

const run = (createdBy: string, approvals: unknown[] = []) => JSON.stringify({ id: "wf_1", createdBy: { id: createdBy }, approvals });
const pending = { id: "apr_1", status: "pending", reviewer: null };
const decidedBy = (id: string) => ({ id: "apr_1", status: "approved", reviewer: { id } });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(readFileSync(join(__dirname, "..", "supabase", "migrations", "0001_workspaces.sql"), "utf8"));
  for (const u of [ALICE, BOB, RITA, MALLORY, VERA]) await db.query(`insert into auth.users values ($1, $2, now())`, [u, `${u.slice(-1)}@example.test`]);

  orgA = (await as<{ id: string }>(ALICE, `select public.create_organisation('Org A', 'Alice', '{"records":[]}') as id`))[0].id;
  orgB = (await as<{ id: string }>(MALLORY, `select public.create_organisation('Org B', 'Mallory', '{"records":["secret"]}') as id`))[0].id;
  for (const [u, role] of [[BOB, "Auditor"], [RITA, "Reviewer"], [VERA, "Read-only"]]) {
    await as(ALICE, `insert into public.invitations (organisation_id, email, role) values ($1, $2, $3)`, [orgA, `${u.slice(-1)}@example.test`, role]);
    expect((await as<{ n: number }>(u, `select public.accept_invitations('${role} user') as n`))[0].n).toBe(1);
  }
});

describe("Supabase schema and row-level security", () => {
  it("isolates tenants: members of one organisation cannot see another's data", async () => {
    expect(await as(MALLORY, `select * from public.workspaces where organisation_id = $1`, [orgA])).toHaveLength(0);
    expect(await as(BOB, `select * from public.workspaces where organisation_id = $1`, [orgB])).toHaveLength(0);
    expect(await as(BOB, `select organisation_id from public.workspaces`)).toEqual([{ organisation_id: orgA }]);
    expect(await as(MALLORY, `select * from public.memberships where organisation_id = $1`, [orgA])).toHaveLength(0);
    // Updates against another tenant silently match no rows.
    expect(await as(MALLORY, `update public.workspaces set state = '{}', updated_by = $2 where organisation_id = $1 returning 1`, [orgA, MALLORY])).toHaveLength(0);
  });

  it("gives anonymous visitors nothing", async () => {
    await fails(as(null, `select * from public.workspaces`));
    await fails(as(null, `select public.create_organisation('x', 'x', '{}')`));
  });

  it("lets editors write the workspace, bumps the version, and blocks Read-only members", async () => {
    const [before] = await as<{ version: number }>(BOB, `select version from public.workspaces where organisation_id = $1`, [orgA]);
    const [after] = await as<{ version: number }>(BOB, `update public.workspaces set state = '{"records":[1]}', updated_by = $2 where organisation_id = $1 returning version`, [orgA, BOB]);
    expect(after.version).toBe(before.version + 1);
    expect(await as(VERA, `update public.workspaces set state = '{}', updated_by = $2 where organisation_id = $1 returning 1`, [orgA, VERA])).toHaveLength(0);
    // updated_by must be the caller.
    await fails(as(BOB, `update public.workspaces set state = '{}', updated_by = $2 where organisation_id = $1`, [orgA, ALICE]));
  });

  it("only Admins manage members, and never their own row", async () => {
    await fails(as(BOB, `insert into public.invitations (organisation_id, email, role) values ($1, 'x@example.test', 'Admin')`, [orgA]));
    expect(await as(BOB, `update public.memberships set role = 'Admin' where user_id = $1 returning 1`, [BOB])).toHaveLength(0);
    expect(await as(ALICE, `update public.memberships set role = 'Read-only' where user_id = $1 returning 1`, [ALICE])).toHaveLength(0);
    expect(await as(ALICE, `update public.memberships set role = 'Auditor' where user_id = $1 returning role`, [VERA])).toEqual([{ role: "Auditor" }]);
    await as(ALICE, `update public.memberships set role = 'Read-only' where user_id = $1`, [VERA]);
  });

  it("ignores invitations until the email address is confirmed", async () => {
    const UNCONFIRMED = "00000000-0000-0000-0000-00000000000f";
    await db.query(`insert into auth.users values ($1, 'f@example.test', null)`, [UNCONFIRMED]);
    await as(ALICE, `insert into public.invitations (organisation_id, email, role) values ($1, 'f@example.test', 'Admin')`, [orgA]);
    expect((await as<{ n: number }>(UNCONFIRMED, `select public.accept_invitations('F') as n`))[0].n).toBe(0);
    expect(await as(UNCONFIRMED, `select * from public.workspaces`)).toHaveLength(0);
  });

  it("enforces workflow roles and the human approval gate in the database", async () => {
    await fails(as(RITA, `insert into public.workflows (id, organisation_id, state, run) values ('wf_r', $1, 'CREATED', $2)`, [orgA, run(RITA)]));
    await as(BOB, `insert into public.workflows (id, organisation_id, state, run) values ('wf_1', $1, 'AWAITING_REVIEW', $2)`, [orgA, run(BOB, [pending])]);
    expect(await as(MALLORY, `select * from public.workflows`)).toHaveLength(0);

    // The initiator cannot approve their own workflow, even by writing the row directly.
    await fails(as(BOB, `update public.workflows set run = $1 where id = 'wf_1'`, [run(BOB, [decidedBy(BOB)])]), /initiator/);
    // A reviewer cannot record an approval in someone else's name.
    await fails(as(RITA, `update public.workflows set run = $1 where id = 'wf_1'`, [run(BOB, [decidedBy(ALICE)])]), /signed-in reviewer/);
    // The Reviewer can.
    await as(RITA, `update public.workflows set run = $1, state = 'REPORTING' where id = 'wf_1'`, [run(BOB, [decidedBy(RITA)])]);
    // Decisions are immutable afterwards.
    await fails(as(ALICE, `update public.workflows set run = $1 where id = 'wf_1'`, [run(BOB, [{ ...decidedBy(RITA), rationale: "edited" }])]), /immutable/);
    // Workflows cannot be deleted.
    expect(await as(ALICE, `delete from public.workflows where id = 'wf_1' returning 1`)).toHaveLength(0);
  });

  it("keeps the audit log append-only and attributed to the caller", async () => {
    await as(BOB, `insert into public.audit_events (organisation_id, actor_label, action, resource) values ($1, 'Bob (Auditor)', 'audit.run', 'audit:1')`, [orgA]);
    await fails(as(BOB, `insert into public.audit_events (organisation_id, actor_id, actor_label, action, resource) values ($1, $2, 'x', 'x', 'x')`, [orgA, ALICE]));
    await fails(as(MALLORY, `insert into public.audit_events (organisation_id, actor_label, action, resource) values ($1, 'x', 'x', 'x')`, [orgA]));
    await fails(as(ALICE, `update public.audit_events set action = 'tampered'`));
    await fails(as(ALICE, `delete from public.audit_events`));
    expect(await as(MALLORY, `select * from public.audit_events`)).toHaveLength(0);
  });

  it("limits organisations created per user", async () => {
    await as(MALLORY, `select public.create_organisation('Org B2', 'M', '{}')`);
    await as(MALLORY, `select public.create_organisation('Org B3', 'M', '{}')`);
    await fails(as(MALLORY, `select public.create_organisation('Org B4', 'M', '{}')`), /quota/);
  });
});
