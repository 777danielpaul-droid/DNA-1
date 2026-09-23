-- PRIS 4.x Memory-Schema
-- WICHTIG: Es wird absichtlich KEIN Chatverlauf mehr in Supabase gespeichert.
-- Supabase enthält ausschließlich explizit erkannte bzw. manuell angelegte Memory-Keys.
-- Einmal im Supabase SQL Editor ausführen.

-- Falls eine ältere PRIS-Version die Chat-History-Tabelle angelegt hat,
-- wird sie hier entfernt. Damit bleiben keine alten Chatverläufe zurück.
drop table if exists public.chat_history;

create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.ai_memory enable row level security;

drop policy if exists "Nutzer verwalten ihre eigenen Fakten" on public.ai_memory;
create policy "Nutzer verwalten ihre eigenen Fakten"
  on public.ai_memory
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
