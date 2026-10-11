-- Let signed-in clients subscribe to changes on their own rows (RLS still limits who receives what).
alter publication supabase_realtime add table public.library_items;
