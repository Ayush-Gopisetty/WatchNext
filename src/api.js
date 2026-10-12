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
// Genre chips: [label, TMDB movie genre id, TMDB tv genre id] (null = no equivalent on that side)
export const GENRES = [
  ['Action', 28, 10759], ['Adventure', 12, 10759], ['Animation', 16, 16], ['Comedy', 35, 35], ['Crime', 80, 80],
  ['Documentary', 99, 99], ['Drama', 18, 18], ['Family', 10751, 10751], ['Fantasy', 14, 10765], ['History', 36, null],
  ['Horror', 27, null], ['Mystery', 9648, 9648], ['Romance', 10749, null], ['Sci-Fi', 878, 10765], ['Thriller', 53, null],
  ['War', 10752, 10768], ['Western', 37, 37],
];
// Does this genre exist for the given Discover tab?
export const genreFits = (g, kind) => {
  const [, m, t] = GENRES.find((x) => x[0] === g) || [];
  if (kind === 'movie' || kind === 'top') return m != null;
  if (kind === 'tv') return t != null;
  if (kind === 'anime') return t != null && g !== 'Animation';
  return m != null || t != null;
};

const discover = (type, kind, genre, page) => {
  const [, m, t] = GENRES.find((x) => x[0] === genre);
  const id = type === 'movie' ? m : t;
  if (id == null) return Promise.resolve([]);
  const params = { with_genres: kind === 'anime' ? `16,${id}` : id, page, sort_by: 'popularity.desc' };
  if (kind === 'anime') params.with_original_language = 'ja';
  if (kind === 'top') Object.assign(params, { sort_by: 'vote_average.desc', 'vote_count.gte': 500 });
  return tmdb(`/discover/${type}`, params).then((r) => list(r, type));
};

// TMDB returns 20 per page; callers ask for page 1, 2, 3... (max 500). `genre` is a GENRES label or null.
export const browse = (kind, page = 1, genre = null) => {
  if (genre) {
    if (kind === 'movie' || kind === 'top') return discover('movie', kind, genre, page);
    if (kind === 'tv' || kind === 'anime') return discover('tv', kind, genre, page);
    // Trending: mix movies and shows, alternating so both stay visible
    return Promise.all([discover('movie', kind, genre, page), discover('tv', kind, genre, page)]).then(([mv, tv]) => {
      const out = [];
      for (let i = 0; i < Math.max(mv.length, tv.length); i++) { if (mv[i]) out.push(mv[i]); if (tv[i]) out.push(tv[i]); }
      return out;
    });
  }
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

// Warm the cache when the user hovers a card, so the page opens instantly.
export const prefetch = (it) => { (it.type === 'person' ? person(it.id) : details(it.type, it.id)).catch(() => {}); };
