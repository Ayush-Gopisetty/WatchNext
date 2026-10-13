// Proxy + cache in front of TMDB so the API key never reaches the browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOW = [
  /^\/trending\/(all|movie|tv)\/week$/,
  /^\/(movie|tv)\/(popular|top_rated)$/,
  /^\/search\/multi$/,
  /^\/discover\/(movie|tv)$/,
  /^\/person\/\d+$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/tv\/\d+\/season\/\d+$/,
  /^\/tv\/\d+\/season\/\d+\/episode\/\d+$/,
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

type Req = { path: string; params?: Record<string, unknown> };
const keyOf = ({ path, params = {} }: Req) =>
  `${path}?${JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))}`;
const valid = (r: Req) => typeof r?.path === 'string' && ALLOW.some((a) => a.test(r.path));

// Fetch from TMDB; `stale` is a cached body to fall back on if TMDB fails.
async function fromTmdb({ path, params = {} }: Req, stale?: unknown) {
  const key = Deno.env.get('TMDB_KEY')!;
  const url = new URL('https://api.themoviedb.org/3' + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const headers: Record<string, string> = {};
  if (key.length > 40) headers.Authorization = `Bearer ${key}`; else url.searchParams.set('api_key', key);
  const r = await fetch(url, { headers });
  if (!r.ok) return stale ? { body: stale } : { error: `TMDB ${r.status}`, status: r.status === 404 ? 404 : 502 };
  return { body: await r.json(), fresh: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const input = await req.json().catch(() => ({}));
  const single = !Array.isArray(input.batch);
  const reqs: Req[] = single ? [input] : input.batch.slice(0, 25);
  if (!reqs.length || !reqs.every(valid)) return json({ error: 'path not allowed' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const keys = reqs.map(keyOf);
  // one cache read for the whole batch
  const { data: hits } = await db.from('tmdb_cache').select('cache_key, body, fetched_at').in('cache_key', keys);
  const byKey = new Map((hits || []).map((h) => [h.cache_key, h]));

  const writes: { cache_key: string; body: unknown; fetched_at: string }[] = [];
  const results = await Promise.all(reqs.map(async (r, i) => {
    const hit = byKey.get(keys[i]);
    if (hit && Date.now() - new Date(hit.fetched_at).getTime() < ttl(r.path)) return { body: hit.body };
    const out = await fromTmdb(r, hit?.body);
    if (out.fresh) writes.push({ cache_key: keys[i], body: out.body, fetched_at: new Date().toISOString() });
    return out;
  }));
  // one cache write for the whole batch
  if (writes.length) await db.from('tmdb_cache').upsert(writes);

  if (single) return results[0].error ? json({ error: results[0].error }, results[0].status) : json(results[0].body);
  return json({ results: results.map((o) => (o.error ? { error: o.error } : { body: o.body })) });
});
