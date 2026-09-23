-- Apply manually after 202609230001_init.sql. Existing successful imports count as initial imports.
alter table public.google_connections
  add column initial_imported_at timestamptz,
  add column last_sheet_export_at timestamptz,
  add column last_sheet_export_error text,
  add column granted_scopes text,
  add column sync_lock_id uuid,
  add column sync_lock_at timestamptz;

update public.google_connections
set initial_imported_at = last_sheet_sync_at
where last_sheet_sync_at is not null;

create index google_connections_initial_imported_idx
  on public.google_connections(initial_imported_at)
  where initial_imported_at is not null;
