export const IMG = (p, size = 'w342') => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);

import { supabase } from './supabase';

// All TMDB traffic goes through our Supabase edge function (key stays server-side, responses are cached).
const cache = new Map();
async function tmdb(path, params = {}) {
  if (!supabase) throw new Error('NO_BACKEND');
  const ck = path + JSON.stringify(params);
  if (cache.has(ck)) return cache.get(ck);
  const p = supabase.functions.invoke('tmdb', { body: { path, params } }).then(({ data, error }) => {
    if (error || data?.error) { cache.delete(ck); throw new Error(error?.message || data.error); }
    return data;
  });
  cache.set(ck, p);
  return p;
}

// Anime = animation genre (16) + Japanese origin
export const isAnime = (x) =>
  (x.genre_ids || x.genres?.map((g) => g.id) || []).includes(16) && x.original_language === 'ja';

// Normalise list results from TMDB into one shape
export function norm(x, fallbackType) {
  const type = x.media_type || fallbackType || (x.title ? 'movie' : 'tv');
  return {
    key: `${type}:${x.id}`,
    id: x.id,
    type,
    title: x.title || x.name,
    year: (x.release_date || x.first_air_date || '').slice(0, 4),
    poster: x.poster_path,
    backdrop: x.backdrop_path,
    overview: x.overview,
    vote: x.vote_average,
    genres: x.genre_ids || x.genres?.map((g) => g.id) || [],
    anime: isAnime(x),
  };
}
const list = (r, t) => r.results.filter((x) => x.media_type !== 'person').map((x) => norm(x, t));

export const trending = (t = 'all') => tmdb(`/trending/${t}/week`).then((r) => list(r));
export const search = (q) => tmdb('/search/multi', { query: q, include_adult: false }).then((r) => list(r));
export const browse = (kind) => {
  if (kind === 'movie') return tmdb('/movie/popular').then((r) => list(r, 'movie'));
  if (kind === 'tv') return tmdb('/tv/popular').then((r) => list(r, 'tv'));
  if (kind === 'anime')
    return tmdb('/discover/tv', { with_genres: 16, with_original_language: 'ja', sort_by: 'popularity.desc' }).then((r) => list(r, 'tv'));
  if (kind === 'top')
    return tmdb('/movie/top_rated').then((r) => list(r, 'movie'));
  return trending();
};

export async function details(type, id) {
  const r = await tmdb(`/${type}/${id}`, { append_to_response: 'videos,credits,recommendations,similar,keywords' });
  return {
    ...norm(r, type),
    tagline: r.tagline,
    runtime: r.runtime || r.episode_run_time?.[0],
    genreNames: r.genres.map((g) => g.name),
    seasons: (r.seasons || []).filter((s) => s.season_number > 0),
    totalEpisodes: r.number_of_episodes,
    status: r.status,
    cast: r.credits?.cast?.slice(0, 10) || [],
    trailer: pickTrailer(r.videos?.results),
    videos: (r.videos?.results || []).filter((v) => v.site === 'YouTube'),
    recs: list(r.recommendations || { results: [] }, type),
    similar: list(r.similar || { results: [] }, type),
  };
}

export function pickTrailer(vs = []) {
  const yt = vs.filter((v) => v.site === 'YouTube');
  const rank = (v) => (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : 2) + (v.official ? 0 : 0.5);
  return yt.sort((a, b) => rank(a) - rank(b))[0] || null;
}

export const season = (id, n) => tmdb(`/tv/${id}/season/${n}`);
export const episodeVideos = (id, s, e) =>
  tmdb(`/tv/${id}/season/${s}/episode/${e}/videos`).then((r) => pickTrailer(r.results)).catch(() => null);
