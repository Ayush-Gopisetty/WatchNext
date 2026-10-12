-- The edge functions use the service role to read/write the shared response cache. Newer Supabase projects don't
-- auto-grant table privileges to API roles, so without this every cache read/write fails with "permission denied".
-- RLS stays on with no policies, so anon/authenticated users still can't touch the table.
grant select, insert, update, delete on table public.tmdb_cache to service_role;
