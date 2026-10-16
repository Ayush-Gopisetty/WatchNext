-- Keep the shared cache from growing forever. Every row has a short useful life (TMDB lists 6h, details 72h,
-- OMDb scores 7 days, usage counters 1 day), so anything untouched for two weeks is safe to drop.
-- Runs daily at 04:00 UTC via pg_cron (enable it under Database → Extensions if this fails).
create extension if not exists pg_cron;
create index if not exists tmdb_cache_fetched_at on public.tmdb_cache (fetched_at);

select cron.schedule(
  'tmdb-cache-cleanup',
  '0 4 * * *',
  $$delete from public.tmdb_cache where fetched_at < now() - interval '14 days'$$
);
