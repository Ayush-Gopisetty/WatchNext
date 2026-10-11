import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

// Everything the user tracks lives in localStorage under one key.
const LS = 'watchnext_v1';
const load = () => {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; }
};
let state = { items: {}, spoilerShield: true, ...load() };
const subs = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  try { localStorage.setItem(LS, JSON.stringify(state)); } catch {}
  subs.forEach((f) => f());
};
const useStore = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state);

export const epKey = (s, e) => `${s}x${e}`;

export function useLibrary() {
  return useStore();
}

function upsert(item, patch) {
  const prev = state.items[item.key] || {
    key: item.key, type: item.type, id: item.id, title: item.title, poster: item.poster,
    year: item.year, genres: item.genres || [], anime: item.anime, total: item.totalEpisodes || 0,
    eps: {}, addedAt: Date.now(),
  };
  const next = { ...prev, ...patch, updatedAt: Date.now() };
  set({ items: { ...state.items, [item.key]: next } });
  push(next);
}

// ---- cloud sync (only when signed in; otherwise localStorage alone) ----
let userId = null;
function push(it) {
  if (!supabase || !userId) return;
  supabase.from('library_items')
    .upsert({ user_id: userId, key: it.key, data: it, updated_at: new Date(it.updatedAt).toISOString() })
    .then(({ error }) => error && console.warn('sync failed', error.message));
}

// On sign-in: merge cloud + local by newest updatedAt, then push anything local that's newer.
export async function signedIn(user) {
  userId = user.id;
  const { data, error } = await supabase.from('library_items').select('data');
  if (error) return console.warn('sync failed', error.message);
  const merged = { ...state.items };
  for (const { data: remote } of data) {
    const local = merged[remote.key];
    if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) merged[remote.key] = remote;
  }
  const remoteMap = Object.fromEntries(data.map((r) => [r.data.key, r.data]));
  set({ items: merged });
  Object.values(merged).forEach((it) => {
    if (!remoteMap[it.key] || (it.updatedAt || 0) > (remoteMap[it.key].updatedAt || 0)) push(it);
  });
}
// On sign-out wipe the local copy so the next person on this browser doesn't inherit it.
export function signedOut() { userId = null; set({ items: {} }); }

export const actions = {
  toggleMovie(item) {
    const cur = state.items[item.key];
    upsert(item, { watched: !cur?.watched });
  },
  toggleEpisode(item, s, e) {
    const cur = state.items[item.key];
    const eps = { ...(cur?.eps || {}) };
    const k = epKey(s, e);
    if (eps[k]) delete eps[k]; else eps[k] = Date.now();
    upsert(item, { eps, total: item.totalEpisodes || cur?.total || 0 });
  },
  setEpisodes(item, list, on) {
    const cur = state.items[item.key];
    const eps = { ...(cur?.eps || {}) };
    list.forEach(([s, e]) => { if (on) eps[epKey(s, e)] = Date.now(); else delete eps[epKey(s, e)]; });
    upsert(item, { eps, total: item.totalEpisodes || cur?.total || 0 });
  },
  rate(item, rating) {
    upsert(item, { rating: state.items[item.key]?.rating === rating ? 0 : rating });
  },
  toggleWatchlist(item) {
    upsert(item, { watchlist: !state.items[item.key]?.watchlist });
  },
  remove(key) {
    const items = { ...state.items };
    delete items[key];
    set({ items });
    if (supabase && userId) supabase.from('library_items').delete().eq('key', key).then(() => {});
  },
  setShield(v) { set({ spoilerShield: v }); },
};

export const epCount = (it) => Object.keys(it.eps || {}).length;
export const isStarted = (it) => it.type === 'movie' ? it.watched : epCount(it) > 0;
export const isFinished = (it) => it.type === 'movie' ? it.watched : it.total > 0 && epCount(it) >= it.total;
