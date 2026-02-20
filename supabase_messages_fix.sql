-- =============================================================================
-- MESSAGES: Fix table + RLS so messages save and show for both sender & receiver
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- =============================================================================

-- 1) Ensure messages table has all columns (add if missing)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  receiver text not null,
  content text not null,
  image text,
  timestamp bigint not null,
  read boolean default false
);

-- Add columns if table already existed without them
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'image') then
    alter table public.messages add column image text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'read') then
    alter table public.messages add column read boolean default false;
  end if;
end $$;

-- 2) Enable RLS (required by Supabase)
alter table public.messages enable row level security;

-- 3) Drop old policies so we can replace them
drop policy if exists "public read messages" on public.messages;
drop policy if exists "public write messages" on public.messages;
drop policy if exists "public update messages" on public.messages;
drop policy if exists "Allow read messages" on public.messages;
drop policy if exists "Allow insert messages" on public.messages;
drop policy if exists "Allow update messages" on public.messages;

-- 4) Policies that allow the app (anon key) to read/insert/update all rows
--    So: any user can SELECT messages where they are sender OR receiver (app filters),
--        and can INSERT/UPDATE their own rows (app sends correct sender/receiver).
create policy "messages_select_all"
  on public.messages for select
  to anon, authenticated
  using (true);

create policy "messages_insert_all"
  on public.messages for insert
  to anon, authenticated
  with check (true);

create policy "messages_update_all"
  on public.messages for update
  to anon, authenticated
  using (true)
  with check (true);

-- 5) Indexes for fast load by sender/receiver
create index if not exists idx_messages_sender on public.messages (sender);
create index if not exists idx_messages_receiver on public.messages (receiver);
create index if not exists idx_messages_timestamp on public.messages (timestamp);

-- 6) Grant usage (skip if you get "permission denied" - Supabase often has these already)
-- grant all on public.messages to anon;
-- grant all on public.messages to authenticated;
-- grant all on public.messages to service_role;
