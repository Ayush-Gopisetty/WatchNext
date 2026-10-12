// Looks up IMDb / Rotten Tomatoes / Metacritic scores for a title via OMDb.
// The OMDb key stays server-side. Results are cached in tmdb_cache like the TMDB proxy does, and every real
// OMDb request is counted per UTC day (row `omdb-usage:YYYY-MM-DD`). Once OMDb reports its daily limit, or our
// count reaches OMDB_DAILY_LIMIT, ALL lookups answer { limit: true } until the next day so the app hides scores everywhere.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEEK = 7 * 24 * 3600_000;
const DAILY_LIMIT = Number(Deno.env.get('OMDB_DAILY_LIMIT')) || 1000;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const num = (v?: string) => (v && v !== 'N/A' ? v : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { imdb_id, usage } = await req.json().catch(() => ({}));

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const day = new Date().toISOString().slice(0, 10);
  const usageKey = `omdb-usage:${day}`;
  const { data: u } = await db.from('tmdb_cache').select('body').eq('cache_key', usageKey).maybeSingle();
  const today = { count: 0, limit_hit: false, ...(u?.body || {}) };
  const save = (patch: Record<string, unknown>) => {
    Object.assign(today, patch);
    return db.from('tmdb_cache').upsert({ cache_key: usageKey, body: today, fetched_at: new Date().toISOString() });
  };

  // GET-style usage report: { usage: true }
  if (usage) return json({ date: day, requests: today.count, limit: DAILY_LIMIT, limit_hit: today.limit_hit || today.count >= DAILY_LIMIT });

  if (typeof imdb_id !== 'string' || !/^tt\d{5,10}$/.test(imdb_id)) return json({ error: 'bad imdb_id' }, 400);

  const key = Deno.env.get('OMDB_KEY');
  if (!key) return json({ error: 'NO_KEY' }, 503);

  // Limit reached today → hide scores everywhere, even for titles we have saved
  if (today.limit_hit || today.count >= DAILY_LIMIT) return json({ limit: true });

  const cacheKey = `omdb:${imdb_id}`;
  const { data: hit } = await db.from('tmdb_cache').select('body, fetched_at').eq('cache_key', cacheKey).maybeSingle();
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < WEEK) return json(hit.body);

  await save({ count: today.count + 1 });
  const r = await fetch(`https://www.omdbapi.com/?i=${imdb_id}&apikey=${key}`);
  const o = await r.json().catch(() => null);
  if (/limit/i.test(o?.Error || '') || r.status === 401) {
    await save({ limit_hit: true });
    return json({ limit: true });
  }
  if (!r.ok || !o || o.Response === 'False') return hit ? json(hit.body) : json({ error: o?.Error || `OMDb ${r.status}` }, 502);

  const rt = (o.Ratings || []).find((x: { Source: string }) => x.Source === 'Rotten Tomatoes')?.Value;
  const body = {
    imdb: num(o.imdbRating) ? { score: num(o.imdbRating), votes: num(o.imdbVotes) } : null,
    rt: num(rt) ? { score: rt } : null,
    metacritic: num(o.Metascore) ? { score: o.Metascore } : null,
  };
  await db.from('tmdb_cache').upsert({ cache_key: cacheKey, body, fetched_at: new Date().toISOString() });
  return json(body);
});
