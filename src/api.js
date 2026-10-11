export const IMG = (p, size = 'w342') => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);

import { supabase } from './supabase';

// All TMDB traffic goes through our Supabase edge function (key stays server-side, responses are cached).
const cache = new Map();
async function tmdb(path, params = {}) {
  if (!supabase) throw new Error('NO_BACKEND');
  const ck = path + JSON.stringify(params);
  if (cache.has(ck)) return cache.get(ck);
  const p = supabase.functions.invoke('tmdb', { body: { path, params } }).then(async ({ data, error }) => {
    if (error || data?.error) {
      cache.delete(ck);
      // supabase-js hides the response body behind a generic message; surface the real reason
      const body = await error?.context?.json?.().catch(() => null);
      throw new Error(body?.error || data?.error || error.message);
    }
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

export const trending = (t = 'all', page = 1) => tmdb(`/trending/${t}/week`, { page }).then((r) => list(r));
const normPerson = (x) => ({ key: `person:${x.id}`, id: x.id, type: 'person', title: x.name, poster: x.profile_path, dept: x.known_for_department, genres: [] });
// Search returns titles and people together
export const search = (q, page = 1) =>
  tmdb('/search/multi', { query: q, include_adult: false, page }).then((r) =>
    r.results.filter((x) => ['movie', 'tv', 'person'].includes(x.media_type)).map((x) => (x.media_type === 'person' ? normPerson(x) : norm(x))));
// TMDB returns 20 per page; callers ask for page 1, 2, 3... (max 500)
export const browse = (kind, page = 1) => {
  if (kind === 'movie') return tmdb('/movie/popular', { page }).then((r) => list(r, 'movie'));
  if (kind === 'tv') return tmdb('/tv/popular', { page }).then((r) => list(r, 'tv'));
  if (kind === 'anime')
    return tmdb('/discover/tv', { with_genres: 16, with_original_language: 'ja', sort_by: 'popularity.desc', page }).then((r) => list(r, 'tv'));
  if (kind === 'top') return tmdb('/movie/top_rated', { page }).then((r) => list(r, 'movie'));
  return trending('all', page);
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

// Actor / crew member with their full filmography
const NOT_ROLES = [10767, 10763]; // talk shows, news
export async function person(id) {
  const r = await tmdb(`/person/${id}`, { append_to_response: 'combined_credits,external_ids' });
  const seen = new Set();
  const cast = [];
  for (const c of r.combined_credits?.cast || []) {
    const t = norm(c);
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    cast.push({
      ...t,
      character: c.character,
      episodes: c.episode_count,
      popularity: c.popularity || 0,
      date: c.release_date || c.first_air_date || '',
      // talk-show guest spots, news and archive footage aren't acting roles
      appearance: (c.genre_ids || []).some((g) => NOT_ROLES.includes(g)) || /\b(self|himself|herself|themselves)\b|archive/i.test(c.character || ''),
    });
  }
  const crewSeen = new Set();
  const crew = [];
  for (const c of r.combined_credits?.crew || []) {
    if (!['Directing', 'Writing', 'Production', 'Creator'].includes(c.department)) continue;
    const t = norm(c);
    const k = `${t.key}:${c.job}`;
    if (crewSeen.has(k)) continue;
    crewSeen.add(k);
    crew.push({ ...t, job: c.job, popularity: c.popularity || 0, date: c.release_date || c.first_air_date || '' });
  }
  return {
    id: r.id, name: r.name, bio: r.biography, dept: r.known_for_department,
    birthday: r.birthday, deathday: r.deathday, birthplace: r.place_of_birth,
    photo: r.profile_path, aka: r.also_known_as?.slice(0, 4) || [],
    imdb: r.external_ids?.imdb_id, instagram: r.external_ids?.instagram_id,
    cast, crew,
  };
}
