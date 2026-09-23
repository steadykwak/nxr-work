create extension if not exists pgcrypto;
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('sheet', 'manual')),
  source_id text,
  source_row integer,
  source_owner text,
  source_title text not null,
  source_created_raw text,
  source_due_raw text,
  source_created_date date,
  source_due_date date,
  source_completed boolean not null default false,
  source_status text,
  source_note text,
  source_url text,
  source_raw jsonb,
  source_synced_at timestamptz,
  override_completed boolean,
  override_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sheet_source_id_required check (source <> 'sheet' or source_id is not null)
);
create unique index tasks_user_source_id_unique on public.tasks(user_id, source, source_id);
create index tasks_user_due_idx on public.tasks(user_id, source_due_date);
alter table public.tasks enable row level security;
create policy tasks_select_own on public.tasks for select to authenticated using (auth.uid() = user_id);
create policy tasks_insert_own on public.tasks for insert to authenticated with check (auth.uid() = user_id);
create policy tasks_update_own on public.tasks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_delete_own on public.tasks for delete to authenticated using (auth.uid() = user_id);
create table public.google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  expires_at timestamptz not null,
  google_email text,
  last_sheet_sync_at timestamptz,
  last_calendar_sync_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.google_connections enable row level security;
revoke all on public.google_connections from anon, authenticated;
-- No user-facing RLS policy: only the server's service role can read encrypted tokens.
-- Imported source fields may only be inserted/updated by the server's service role.
create or replace function public.guard_task_source_fields() returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      if new.source <> 'manual' then raise exception 'Only server can import sheet tasks'; end if;
    elsif new.user_id is distinct from old.user_id or new.source is distinct from old.source
      or new.source_id is distinct from old.source_id or new.source_row is distinct from old.source_row
      or new.source_owner is distinct from old.source_owner or new.source_title is distinct from old.source_title
      or new.source_created_raw is distinct from old.source_created_raw or new.source_due_raw is distinct from old.source_due_raw
      or new.source_created_date is distinct from old.source_created_date or new.source_due_date is distinct from old.source_due_date
      or new.source_completed is distinct from old.source_completed or new.source_status is distinct from old.source_status
      or new.source_note is distinct from old.source_note or new.source_url is distinct from old.source_url
      or new.source_raw is distinct from old.source_raw or new.source_synced_at is distinct from old.source_synced_at then
      raise exception 'Source fields are read-only';
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger guard_task_source_fields before insert or update on public.tasks for each row execute function public.guard_task_source_fields();
