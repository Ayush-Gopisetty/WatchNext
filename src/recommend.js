import { related } from './api';
import { epCount, isStarted, isFinished } from './store';

export const GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
  10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};
// TMDB uses different ids for the same idea across movies/TV; fold them together for taste matching.
const FOLD = { 10759: 28, 10765: 878, 10768: 10752 };
const fold = (g) => FOLD[g] || g;

// How much a title says about taste. Rating dominates; otherwise finishing > starting.
export function weight(it) {
  if (it.rating) return (it.rating - 2.5) / 2.5; // 1★ => -0.6 ... 5★ => +1
  if (isFinished(it)) return 0.8;
  if (isStarted(it)) return 0.4 + Math.min(0.3, epCount(it) / 40);
  return 0;
}

export function tasteProfile(items) {
  const g = {};
  let anime = 0, movie = 0, tv = 0, n = 0;
  for (const it of items) {
    const w = weight(it);
    if (!w) continue;
    n++;
    it.genres.forEach((id) => { g[fold(id)] = (g[fold(id)] || 0) + w; });
    if (w > 0) { if (it.anime) anime += w; else if (it.type === 'movie') movie += w; else tv += w; }
  }
  const max = Math.max(1, ...Object.values(g).map(Math.abs));
  const genres = Object.entries(g)
    .map(([id, v]) => ({ id: +id, name: GENRES[id] || 'Other', score: v / max }))
    .sort((a, b) => b.score - a.score);
  return { genres, anime, movie, tv, n };
}

// Candidate pool = TMDB "recommendations" + "similar" of the titles you liked most,
// re-ranked by your own genre profile so it's personal, not just "popular".
export async function recommend(lib) {
  const items = Object.values(lib.items);
  const seen = new Set(items.filter((i) => isStarted(i) || i.rating).map((i) => i.key));
  const sources = items.filter((i) => weight(i) > 0.3).sort((a, b) => weight(b) - weight(a) || b.updatedAt - a.updatedAt).slice(0, 8);
  if (!sources.length) return { recs: [], profile: tasteProfile(items) };
  const profile = tasteProfile(items);
  const affinity = Object.fromEntries(profile.genres.map((x) => [x.id, x.score]));

  const results = await Promise.allSettled(sources.map((s) => related(s.type, s.id)));
  const pool = new Map();
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const src = sources[i], w = weight(src);
    const add = (arr, mult) => arr.forEach((c, rank) => {
      if (seen.has(c.key) || !c.poster) return;
      const e = pool.get(c.key) || { ...c, score: 0, because: [] };
      e.score += w * mult * (1 - rank / 40);
      if (!e.because.includes(src.title)) e.because.push(src.title);
      pool.set(c.key, e);
    });
    add(r.value.recs, 1);
    add(r.value.similar, 0.5);
  });

  const scored = [...pool.values()].map((c) => {
    const ga = c.genres.length ? c.genres.reduce((s, g) => s + (affinity[fold(g)] || 0), 0) / c.genres.length : 0;
    const multi = Math.min(1, c.because.length / 3); // suggested by several of your favourites
    const raw = c.score * 0.8 + ga * 0.9 + (c.vote || 0) / 10 * 0.5 + multi * 0.4;
    return { ...c, raw };
  });
  scored.sort((a, b) => b.raw - a.raw);
  const top = scored[0]?.raw || 1, low = scored[scored.length - 1]?.raw || 0;
  const recs = scored.slice(0, 40).map((c) => ({
    ...c, match: Math.round(60 + 38 * ((c.raw - low) / (top - low || 1))),
  }));
  return { recs, profile };
}
