-- Bounties (bounties Phase 3). Run in the Supabase SQL Editor, after
-- phase18_staff_only_access.sql and phase19_public_binders.sql.
--
-- A bounty is a BGP Discord member asking the shop for a specific card,
-- optionally up to a max price. Decided with the user:
--   - only members of the BGP Discord server can post (app_metadata.member,
--     written by verify-discord-member);
--   - at most 10 open bounties per member, each open for 60 days (a member
--     can renew it);
--   - visitors see the card and price, never who asked;
--   - staff mark one fulfilled (or remove it) from the Bounties tab, and a
--     member can cancel their own.
--
-- Every change goes through the `bounties` Edge Function (service role),
-- which applies those rules and posts to Discord. So members get no
-- insert/update rights here at all: they can only read their own rows.
-- Staff keep full access like every other table (phase18's rule).
--
-- Re-runnable.

create or replace function public.is_member() returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'member')::boolean, false)
$$;

create table if not exists public.bounties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  discord_id text not null default '',
  discord_name text not null default '',
  game text not null,
  name text not null,
  set_name text not null default '',
  number text not null default '',
  rarity text not null default '',
  printing text not null default '',
  condition text not null default '',
  image_url text not null default '',
  max_price numeric,
  notes text not null default '',
  -- open | fulfilled | cancelled | removed. An open bounty past expires_at
  -- counts as expired (no job needed to flip it).
  status text not null default 'open'
    check (status in ('open', 'fulfilled', 'cancelled', 'removed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 days'),
  closed_at timestamptz
);

create index if not exists bounties_user_status on public.bounties (user_id, status);

alter table public.bounties enable row level security;
drop policy if exists "staff full access" on public.bounties;
create policy "staff full access" on public.bounties
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists "members read own" on public.bounties;
create policy "members read own" on public.bounties
  for select to authenticated
  using (user_id = auth.uid());
grant select, insert, update, delete on public.bounties to authenticated;
revoke all on public.bounties from anon;

-- What anyone can see: open, unexpired bounties, without who asked.
create or replace view public.public_bounties as
select
  id, game, name, set_name, number, rarity, printing, condition,
  image_url, max_price, created_at, expires_at
from public.bounties
where status = 'open' and expires_at > now();

grant select on public.public_bounties to anon, authenticated;

-- Check: returns 0 until someone posts.
--   select count(*) from public_bounties;
