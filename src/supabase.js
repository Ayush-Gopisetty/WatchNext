import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
// PKCE puts a one-time ?code= in the query string (not the #hash), so it can't collide with our hash router.
// null when .env isn't filled in yet; callers surface a "backend not configured" message
export const supabase = url && anon ? createClient(url, anon, { auth: { flowType: 'pkce' } }) : null;
