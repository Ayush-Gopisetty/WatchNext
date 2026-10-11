// Proxy + cache in front of TMDB so the API key never reaches the browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOW = [
  /^\/trending\/(all|movie|tv)\/week$/,
  /^\/(movie|tv)\/(popular|top_rated)$/,
  /^\/search\/multi$/,
  /^\/discover\/tv$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/tv\/\d+\/season\/\d+$/,
  /^\/tv\/\d+\/season\/\d+\/episode\/\d+\/videos$/,
];
const HOUR = 3600_000;
const ttl = (path: string) => (/trending|popular|top_rated|discover|search/.test(path) ? 6 * HOUR : 72 * HOUR);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { path, params = {} } = await req.json().catch(() => ({}));
  if (typeof path !== 'string' || !ALLOW.some((r) => r.test(path))) return json({ error: 'path not allowed' }, 400);

  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const cacheKey = `${path}?${JSON.stringify(sorted)}`;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: hit } = await db.from('tmdb_cache').select('body, fetched_at').eq('cache_key', cacheKey).maybeSingle();
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < ttl(path)) return json(hit.body);

  const key = Deno.env.get('TMDB_KEY')!;
  const url = new URL('https://api.themoviedb.org/3' + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const headers: Record<string, string> = {};
  if (key.length > 40) headers.Authorization = `Bearer ${key}`; else url.searchParams.set('api_key', key);

  const r = await fetch(url, { headers });
  if (!r.ok) return hit ? json(hit.body) : json({ error: `TMDB ${r.status}` }, r.status === 404 ? 404 : 502);
  const body = await r.json();
  await db.from('tmdb_cache').upsert({ cache_key: cacheKey, body, fetched_at: new Date().toISOString() });
  return json(body);
});
