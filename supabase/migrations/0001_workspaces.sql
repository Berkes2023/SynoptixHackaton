-- DeepTrace: tenant-isolated workspaces, workflows and an append-only audit log.
--
-- Every table has row-level security. The app talks to Postgres only with the
-- signed-in user's session (anon key + JWT), never a service-role key, so these
-- policies are the tenant boundary. Helper functions live in a schema that the
-- Data API does not expose.

create schema if not exists private;

-- ---------- Tables ----------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.memberships (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('Admin', 'Auditor', 'Reviewer', 'Read-only')),
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null check (role in ('Admin', 'Auditor', 'Reviewer', 'Read-only')),
  invited_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (organisation_id, email)
);

-- One workspace document per organisation (records, imports, audits, findings,
-- investigations, reports, experiments, settings). `version` gives optimistic
-- concurrency; the API merges per section on conflict.
create table public.workspaces (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  state jsonb not null,
  version integer not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint workspace_size check (pg_column_size(state) < 8000000)
);

create table public.workflows (
  id text primary key check (char_length(id) between 3 and 80),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  created_by uuid not null default auth.uid(),
  state text not null,
  run jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workflows_org_idx on public.workflows (organisation_id, created_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  actor_id uuid not null default auth.uid(),
  actor_label text not null,
  action text not null check (char_length(action) <= 120),
  resource text not null check (char_length(resource) <= 200),
  details text check (char_length(details) <= 2000),
  at timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events (organisation_id, at desc);

-- ---------- Helpers ----------

-- The caller's role in an organisation, or null when not a member.
-- security definer so policies on memberships can call it without recursion.
create function private.role_in(org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m where m.organisation_id = org and m.user_id = auth.uid()
$$;

create function private.has_role(org uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.role_in(org) = any (roles), false)
$$;

-- ---------- Row-level security ----------

alter table public.organisations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.workspaces enable row level security;
alter table public.workflows enable row level security;
alter table public.audit_events enable row level security;

-- Organisations: members read; Admins rename. Creation only via create_organisation().
create policy org_select on public.organisations for select to authenticated using (private.role_in(id) is not null);
create policy org_update on public.organisations for update to authenticated
  using (private.has_role(id, array['Admin'])) with check (private.has_role(id, array['Admin']));

-- Memberships: members see their colleagues; only Admins add, change or remove,
-- and never their own row (no self-escalation, no locking yourself out).
create policy mem_select on public.memberships for select to authenticated using (private.role_in(organisation_id) is not null);
create policy mem_insert on public.memberships for insert to authenticated
  with check (private.has_role(organisation_id, array['Admin']) and user_id <> auth.uid());
create policy mem_update on public.memberships for update to authenticated
  using (private.has_role(organisation_id, array['Admin']) and user_id <> auth.uid())
  with check (private.has_role(organisation_id, array['Admin']) and user_id <> auth.uid());
create policy mem_delete on public.memberships for delete to authenticated
  using (private.has_role(organisation_id, array['Admin']) and user_id <> auth.uid());

-- Invitations: Admins manage; invitees can see invitations addressed to their email.
create policy inv_select on public.invitations for select to authenticated
  using (private.has_role(organisation_id, array['Admin']) or email = lower(auth.jwt() ->> 'email'));
create policy inv_insert on public.invitations for insert to authenticated
  with check (private.has_role(organisation_id, array['Admin']) and invited_by = auth.uid());
create policy inv_delete on public.invitations for delete to authenticated using (private.has_role(organisation_id, array['Admin']));

-- Workspaces: members read; Read-only members never write. Finer per-section
-- permissions (e.g. only Admins change settings) are enforced by the API.
create policy ws_select on public.workspaces for select to authenticated using (private.role_in(organisation_id) is not null);
create policy ws_update on public.workspaces for update to authenticated
  using (private.has_role(organisation_id, array['Admin', 'Auditor', 'Reviewer']))
  with check (private.has_role(organisation_id, array['Admin', 'Auditor', 'Reviewer']) and updated_by = auth.uid());

-- Workflows: members read; Admins/Auditors start; Admins/Auditors/Reviewers update
-- (advance, approve, cancel). No deletes: workflow history is retained.
create policy wf_select on public.workflows for select to authenticated using (private.role_in(organisation_id) is not null);
create policy wf_insert on public.workflows for insert to authenticated
  with check (private.has_role(organisation_id, array['Admin', 'Auditor']) and created_by = auth.uid());
create policy wf_update on public.workflows for update to authenticated
  using (private.has_role(organisation_id, array['Admin', 'Auditor', 'Reviewer']))
  with check (private.has_role(organisation_id, array['Admin', 'Auditor', 'Reviewer']));

-- Audit log: append-only. Members insert events attributed to themselves; nobody updates or deletes.
create policy ev_select on public.audit_events for select to authenticated using (private.role_in(organisation_id) is not null);
create policy ev_insert on public.audit_events for insert to authenticated
  with check (private.role_in(organisation_id) is not null and actor_id = auth.uid());
revoke update, delete, truncate on public.audit_events from authenticated, anon;

-- Anonymous visitors get nothing.
revoke all on public.organisations, public.memberships, public.invitations, public.workspaces, public.workflows, public.audit_events from anon;

-- ---------- Integrity triggers ----------

-- Defence in depth for the human approval gate: a decided approval must be
-- recorded by the signed-in user, and never by the person who started the workflow.
create function private.check_workflow_approvals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a jsonb;
  old_status text;
begin
  if new.id <> old.id or new.organisation_id <> old.organisation_id or new.created_by <> old.created_by then
    raise exception 'workflow identity is immutable';
  end if;
  for a in select * from jsonb_array_elements(coalesce(new.run -> 'approvals', '[]'::jsonb)) loop
    if a ->> 'status' in ('approved', 'rejected') then
      select o ->> 'status' into old_status
        from jsonb_array_elements(coalesce(old.run -> 'approvals', '[]'::jsonb)) o
        where o ->> 'id' = a ->> 'id';
      if old_status is distinct from a ->> 'status' then
        if a -> 'reviewer' ->> 'id' is distinct from auth.uid()::text then
          raise exception 'approval must be recorded by the signed-in reviewer';
        end if;
        if a -> 'reviewer' ->> 'id' = new.created_by::text then
          raise exception 'the workflow initiator cannot approve their own request';
        end if;
        if not private.has_role(new.organisation_id, array['Admin', 'Reviewer']) then
          raise exception 'only Admins and Reviewers may decide approvals';
        end if;
      elsif old_status in ('approved', 'rejected') and (
        select o from jsonb_array_elements(old.run -> 'approvals') o where o ->> 'id' = a ->> 'id'
      ) is distinct from a then
        raise exception 'decided approvals are immutable';
      end if;
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;
create trigger workflows_check_approvals before update on public.workflows
  for each row execute function private.check_workflow_approvals();

create function private.bump_workspace_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organisation_id <> old.organisation_id then
    raise exception 'workspace organisation is immutable';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger workspaces_bump_version before update on public.workspaces
  for each row execute function private.bump_workspace_version();

-- ---------- RPCs ----------

-- Create an organisation with the caller as its first Admin and an empty workspace.
-- Quota: at most 3 organisations created per user.
create function public.create_organisation(org_name text, display_name text, initial_state jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.organisations o where o.created_by = auth.uid()) >= 3 then
    raise exception 'organisation quota reached';
  end if;
  insert into public.organisations (name, created_by) values (org_name, auth.uid()) returning id into org;
  insert into public.memberships (organisation_id, user_id, role, display_name) values (org, auth.uid(), 'Admin', display_name);
  insert into public.workspaces (organisation_id, state, updated_by) values (org, initial_state, auth.uid());
  return org;
end;
$$;

-- Join every organisation that invited the caller's (confirmed) email address.
create function public.accept_invitations(display_name text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  em text := lower(auth.jwt() ->> 'email');
  n integer := 0;
  inv record;
begin
  if auth.uid() is null or em is null then return 0; end if;
  if not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null) then
    return 0;
  end if;
  for inv in select * from public.invitations i where i.email = em and i.accepted_at is null loop
    insert into public.memberships (organisation_id, user_id, role, display_name)
      values (inv.organisation_id, auth.uid(), inv.role, display_name)
      on conflict (organisation_id, user_id) do nothing;
    update public.invitations set accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.create_organisation(text, text, jsonb), public.accept_invitations(text) from public, anon;
grant execute on function public.create_organisation(text, text, jsonb), public.accept_invitations(text) to authenticated;
revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
