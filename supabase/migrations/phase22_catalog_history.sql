-- Catalog change history. Run in the Supabase SQL Editor, after
-- phase18_staff_only_access.sql (this uses its public.is_staff()).
--
-- Every insert, update and delete on catalog writes one row here: which
-- card, what changed (each field's old and new value), when, and which
-- login made the change. Written by a trigger, so nothing in the app can
-- forget to log a change, and a change made from the SQL Editor or an
-- import is logged too. Added after cards were moved and the moves were
-- lost with no way to see what had happened (CLAUDE.md "Change history").
--
-- The two inline image columns (image_data/photo_data, ~50-150 KB each)
-- are never copied in; a change to them is logged as {"changed": true}.
-- last_updated is left out too (it changes on every save).
--
-- Staff can read it; nobody can edit or delete it from the app (no write
-- grants: only the trigger, which runs as the table owner, writes).
-- Re-runnable.

create table if not exists public.catalog_history (
  id bigserial primary key,
  sku text not null,
  name text not null default '',
  action text not null check (action in ('insert', 'update', 'delete')),
  -- update: { column: { "from": old, "to": new } } for changed columns only
  -- insert/delete: the whole row (minus the image columns)
  changes jsonb not null default '{}'::jsonb,
  changed_by text not null default '',
  changed_at timestamptz not null default now()
);
create index if not exists catalog_history_sku on public.catalog_history (sku, changed_at desc);
create index if not exists catalog_history_changed_at on public.catalog_history (changed_at desc);

create or replace function public.catalog_history_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  skip text[] := array['image_data', 'photo_data', 'last_updated'];
  who text;
  diff jsonb;
begin
  who := coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    nullif(auth.jwt() ->> 'role', ''),
    current_user
  );

  if tg_op = 'INSERT' then
    insert into public.catalog_history (sku, name, action, changes, changed_by)
    values (new.sku, coalesce(new.name, ''), 'insert', to_jsonb(new) - skip, who);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.catalog_history (sku, name, action, changes, changed_by)
    values (old.sku, coalesce(old.name, ''), 'delete', to_jsonb(old) - skip, who);
    return old;
  end if;

  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
    into diff
  from jsonb_each(to_jsonb(new) - skip) n
  left join jsonb_each(to_jsonb(old) - skip) o on o.key = n.key
  where o.value is distinct from n.value;

  if new.image_data is distinct from old.image_data then
    diff := coalesce(diff, '{}'::jsonb) || jsonb_build_object('image_data', jsonb_build_object('changed', true));
  end if;
  if new.photo_data is distinct from old.photo_data then
    diff := coalesce(diff, '{}'::jsonb) || jsonb_build_object('photo_data', jsonb_build_object('changed', true));
  end if;

  -- A save that changed nothing but last_updated isn't worth a row.
  if diff is not null then
    insert into public.catalog_history (sku, name, action, changes, changed_by)
    values (new.sku, coalesce(new.name, ''), 'update', diff, who);
  end if;
  return new;
end;
$$;

revoke all on function public.catalog_history_log() from public, anon, authenticated;

drop trigger if exists catalog_history_log on public.catalog;
create trigger catalog_history_log
  after insert or update or delete on public.catalog
  for each row execute function public.catalog_history_log();

alter table public.catalog_history enable row level security;
drop policy if exists "staff full access" on public.catalog_history;
drop policy if exists "staff read" on public.catalog_history;
create policy "staff read" on public.catalog_history
  for select to authenticated
  using (public.is_staff());
revoke all on public.catalog_history from anon, authenticated;
grant select on public.catalog_history to authenticated;

-- So the app sees the new table right away.
notify pgrst, 'reload schema';
