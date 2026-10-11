-- Per-user tracking data. One row per title; `data` holds episodes, rating, watchlist flag, etc.
create table public.library_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,                 -- e.g. "tv:1399" or "movie:603"
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.library_items enable row level security;
create policy "own rows" on public.library_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Shared TMDB response cache. RLS on with no policies = only the edge function (service role) can touch it.
create table public.tmdb_cache (
  cache_key text primary key,
  body jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.tmdb_cache enable row level security;
