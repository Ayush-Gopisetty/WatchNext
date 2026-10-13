export const IMG = (p, size = 'w342') => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);

import { supabase } from './supabase';

// All TMDB traffic goes through our Supabase edge function (key stays server-side, responses are cached).
const cache = new Map();
const unwrap = async (data, error) => {
  if (error || data?.error) {
    // supabase-js hides the response body behind a generic message; surface the real reason
    const body = await error?.context?.json?.().catch(() => null);
    throw new Error(body?.error || data?.error || error.message);
  }
  return data;
};
// Requests made in the same tick are sent as one edge-function call (one HTTP round trip, one DB cache read).
let queue = [];
function flush() {
  const q = queue;
  queue = [];
  if (q.length === 1) {
    const [{ path, params, res, rej }] = q;
    return supabase.functions.invoke('tmdb', { body: { path, params } }).then(({ data, error }) => unwrap(data, error)).then(res, rej);
  }
  supabase.functions.invoke('tmdb', { body: { batch: q.map(({ path, params }) => ({ path, params })) } })
    .then(async ({ data, error }) => {
      await unwrap(data, error);
      q.forEach((x, i) => (data.results[i].error ? x.rej(new Error(data.results[i].error)) : x.res(data.results[i].body)));
    })
    .catch((e) => q.forEach((x) => x.rej(e)));
}
function tmdb(path, params = {}) {
  if (!supabase) return Promise.reject(new Error('NO_BACKEND'));
  const ck = path + JSON.stringify(params);
  if (cache.has(ck)) return cache.get(ck);
  const p = new Promise((res, rej) => {
    queue.push({ path, params, res, rej });
    if (queue.length === 1) setTimeout(flush, 8);
  });
  p.catch(() => cache.delete(ck));
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
    kdrama: type === 'tv' && x.original_language === 'ko' && (x.origin_country || ['KR']).includes('KR'),
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
  if (kind === 'anime' || kind === 'kdrama') return t != null && g !== 'Animation';
  return m != null || t != null;
};

// Themed slices of a genre, each one a different Discover query
export const FLAVORS = [['popular', 'Popular'], ['top', 'Top rated'], ['new', 'New releases'], ['gems', 'Hidden gems']];
const flavorParams = (type, flavor) => {
  const day = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const date = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  if (flavor === 'top') return { sort_by: 'vote_average.desc', 'vote_count.gte': type === 'movie' ? 1500 : 400 };
  if (flavor === 'new') return { sort_by: `${date}.desc`, [`${date}.lte`]: day(0), [`${date}.gte`]: day(240), 'vote_count.gte': 10 };
  if (flavor === 'gems') return { sort_by: 'vote_average.desc', 'vote_count.gte': 100, 'vote_count.lte': 1000, 'vote_average.gte': 7 };
  return { sort_by: 'popularity.desc' };
};

const discover = (type, kind, genre, page, flavor) => {
  const [, m, t] = GENRES.find((x) => x[0] === genre);
  const id = type === 'movie' ? m : t;
  if (id == null) return Promise.resolve([]);
  const params = { with_genres: kind === 'anime' ? `16,${id}` : id, page, sort_by: 'popularity.desc' };
  if (kind === 'anime') params.with_original_language = 'ja';
  if (kind === 'kdrama') Object.assign(params, { with_original_language: 'ko', with_origin_country: 'KR' });
  if (kind === 'top') Object.assign(params, { sort_by: 'vote_average.desc', 'vote_count.gte': 500 });
  if (flavor) Object.assign(params, flavorParams(type, flavor));
  return tmdb(`/discover/${type}`, params).then((r) => list(r, type));
};

// TMDB returns 20 per page; callers ask for page 1, 2, 3... (max 500). `genre` is a GENRES label or null.
export const browse = (kind, page = 1, genre = null, flavor = null) => {
  if (genre) {
    if (kind === 'movie' || kind === 'top') return discover('movie', kind, genre, page, flavor);
    if (kind === 'tv' || kind === 'anime' || kind === 'kdrama') return discover('tv', kind, genre, page, flavor);
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
  if (kind === 'kdrama')
    return tmdb('/discover/tv', { with_original_language: 'ko', with_origin_country: 'KR', with_genres: 18, sort_by: 'popularity.desc', page }).then((r) => list(r, 'tv'));
  if (kind === 'top') return tmdb('/movie/top_rated', { page }).then((r) => list(r, 'movie'));
  return trending('all', page);
};

// US rating: MPAA (G, PG, PG-13, R, NC-17) for movies, TV Parental Guidelines (TV-Y … TV-MA) for series.
// Falls back to another country's rating when no US one is on file.
function certification(r, type) {
  if (type === 'movie') {
    const rows = r.release_dates?.results || [];
    const pick = (c) => {
      const dates = (rows.find((x) => x.iso_3166_1 === c)?.release_dates || []).filter((d) => d.certification);
      // prefer theatrical (3), then digital/physical/TV, then premiere
      return [3, 4, 5, 6, 2, 1].map((t) => dates.find((d) => d.type === t)).find(Boolean)?.certification || dates[0]?.certification;
    };
    const us = pick('US');
    if (us) return { label: us, country: 'US' };
    const other = rows.find((x) => pick(x.iso_3166_1));
    return other ? { label: pick(other.iso_3166_1), country: other.iso_3166_1 } : null;
  }
  const rows = (r.content_ratings?.results || []).filter((x) => x.rating);
  const hit = rows.find((x) => x.iso_3166_1 === 'US') || rows[0];
  return hit ? { label: hit.rating, country: hit.iso_3166_1 } : null;
}

// IMDb / Rotten Tomatoes / Metacritic scores (via our OMDb proxy). Resolves to null when unavailable.
// When the server says OMDb's daily limit is hit, scores are hidden everywhere (even ones fetched earlier) for a while.
const scores = new Map();
let limitUntil = 0;
export function ratings(imdbId) {
  if (!imdbId || !supabase || Date.now() < limitUntil) return Promise.resolve(null);
  if (!scores.has(imdbId))
    scores.set(imdbId, supabase.functions.invoke('ratings', { body: { imdb_id: imdbId } })
      .then(({ data, error }) => {
        if (data?.limit) { limitUntil = Date.now() + 10 * 60_000; scores.clear(); return null; }
        if (error || data?.error) { scores.delete(imdbId); return null; }
        return data;
      }, () => (scores.delete(imdbId), null)));
  return scores.get(imdbId);
}

// Just the episode count (tiny payload) — used to spot new episodes without pulling full details.
export const episodeTotal = (id) => tmdb(`/tv/${id}`).then((r) => r.number_of_episodes);

// Show basics only (no credits/recs/videos) — same request as episodeTotal, so the two share one cache entry.
export const showLite = (id) => tmdb(`/tv/${id}`).then((r) => ({
  ...norm(r, 'tv'), totalEpisodes: r.number_of_episodes, genreNames: (r.genres || []).map((g) => g.name), seasons: (r.seasons || []).filter((x) => x.season_number > 0),
}));

// Only the candidate lists recommend() needs, not cast/videos/keywords/etc.
export const related = (type, id) =>
  tmdb(`/${type}/${id}`, { append_to_response: 'recommendations,similar' }).then((r) => ({
    recs: list(r.recommendations || { results: [] }, type),
    similar: list(r.similar || { results: [] }, type),
  }));

// IMDb scores of episodes you've opened, kept in this browser so the episode list can show them without new requests.
const EP_KEY = (id) => `epscores:${id}`;
export function savedEpScores(showId) {
  try { return JSON.parse(localStorage.getItem(EP_KEY(showId))) || {}; } catch { return {}; }
}
export function saveEpScore(showId, s, e, score) {
  try { localStorage.setItem(EP_KEY(showId), JSON.stringify({ ...savedEpScores(showId), [`${s}x${e}`]: score })); } catch { /* storage unavailable */ }
}

export async function details(type, id) {
  const r = await tmdb(`/${type}/${id}`, { append_to_response: 'videos,credits,recommendations,similar,keywords,release_dates,content_ratings,external_ids' });
  return {
    ...norm(r, type),
    tagline: r.tagline,
    cert: certification(r, type),
    imdbId: r.imdb_id || r.external_ids?.imdb_id || null,
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
// One episode with cast, crew, trailer and its IMDb id (for scores)
export async function episode(id, s, e) {
  const r = await tmdb(`/tv/${id}/season/${s}/episode/${e}`, { append_to_response: 'credits,videos,external_ids' });
  const crew = r.crew || r.credits?.crew || [];
  const by = (jobs) => crew.filter((c) => jobs.includes(c.job)).map((c) => ({ id: c.id, name: c.name, job: c.job }));
  return {
    name: r.name, overview: r.overview, still: r.still_path, airDate: r.air_date, runtime: r.runtime,
    vote: r.vote_average, votes: r.vote_count, number: r.episode_number, season: r.season_number, type: r.episode_type,
    imdbId: r.external_ids?.imdb_id || null,
    directors: by(['Director']), writers: by(['Writer', 'Screenplay', 'Teleplay', 'Story']),
    cast: [...(r.guest_stars || r.credits?.guest_stars || []), ...(r.credits?.cast || [])]
      .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i).slice(0, 20),
    trailer: pickTrailer(r.videos?.results),
  };
}
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
