-- Vault storage. The server is deliberately ignorant: every field a human would
-- recognise (title, username, password, note body, tags, item type) lives inside
-- `ciphertext`, which is AES-256-GCM sealed with a key derived from the master
-- password in the browser. Postgres only enforces ownership.

create table public.vault_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ciphertext  text not null,
  iv          text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index vault_items_user_updated_idx
  on public.vault_items (user_id, updated_at desc);

alter table public.vault_items enable row level security;

-- Four explicit policies rather than one `for all`, so each verb's intent is
-- reviewable on its own.
create policy "read own items" on public.vault_items
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "create own items" on public.vault_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- `with check` as well as `using`: without it a row could be updated to hand
-- ownership to another user.
create policy "update own items" on public.vault_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "delete own items" on public.vault_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Maintained server-side so a client cannot backdate a row and defeat
-- last-write-wins sync.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.user_id := old.user_id;  -- ownership is immutable
  return new;
end;
$$;

create trigger vault_items_touch_updated_at
  before update on public.vault_items
  for each row execute function public.touch_updated_at();

revoke all on public.vault_items from anon;
