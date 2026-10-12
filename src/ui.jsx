import { Component, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IMG, prefetch } from './api';
import { useLibrary, actions } from './store';

export function useHash() {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => {
    const f = () => { setH(location.hash || '#/'); window.scrollTo(0, 0); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

export function useAsync(fn, deps) {
  const [s, setS] = useState({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setS({ loading: true });
    Promise.resolve().then(fn).then((data) => live && setS({ data }), (error) => live && setS({ error }));
    return () => { live = false; };
  }, [...deps, n]); // eslint-disable-line
  return { ...s, retry: () => setN((x) => x + 1) };
}

// Paged list: fetchPage(n) -> array. Resets when deps change; loadMore() appends the next page.
export function usePaged(fetchPage, deps) {
  const [s, setS] = useState({ items: [], page: 0, loading: true, more: false });
  const [n, setN] = useState(0);
  const run = (page, reset) => {
    setS((p) => ({ ...p, loading: true, error: null, ...(reset ? { items: [], page: 0 } : {}) }));
    return fetchPage(page).then(
      (r) => setS((p) => {
        const seen = new Set(p.items.map((x) => x.key));
        const items = [...p.items, ...r.filter((x) => !seen.has(x.key))];
        return { items, page, loading: false, more: r.length > 0 && page < 500 };
      }),
      (error) => setS((p) => ({ ...p, loading: false, error })),
    );
  };
  useEffect(() => {
    let live = true;
    const stale = () => !live;
    fetchPage(1).then(
      (r) => !stale() && setS({ items: r, page: 1, loading: false, more: r.length > 0 }),
      (error) => !stale() && setS({ items: [], page: 0, loading: false, more: false, error }),
    );
    setS({ items: [], page: 0, loading: true, more: false });
    return () => { live = false; };
  }, [...deps, n]); // eslint-disable-line
  return { ...s, loadMore: () => run(s.page + 1, false), retry: () => setN((x) => x + 1) };
}

export const LoadMore = ({ paged }) =>
  paged.items.length && paged.more ? (
    <div className="more"><button className="btn ghost" disabled={paged.loading} onClick={paged.loadMore}>{paged.loading ? 'Loading…' : 'Load more'}</button></div>
  ) : null;

// ---- toasts (with optional Undo) ----
const bus = new EventTarget();
export const toast = (msg, undo) => bus.dispatchEvent(new CustomEvent('toast', { detail: { msg, undo, id: Math.random() } }));
export function Toaster() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const f = (e) => {
      const t = e.detail;
      setList((l) => [...l.slice(-2), t]);
      setTimeout(() => setList((l) => l.filter((x) => x !== t)), 5000);
    };
    bus.addEventListener('toast', f);
    return () => bus.removeEventListener('toast', f);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">{t.msg}
          {t.undo && <button onClick={() => { t.undo(); setList((l) => l.filter((x) => x !== t)); }}>Undo</button>}
        </div>
      ))}
    </div>
  );
}

export function Card({ it, badge, sub }) {
  const { items } = useLibrary();
  const hover = useRef();
  const isPerson = it.type === 'person';
  const saved = !!items[it.key]?.watchlist;
  const toggle = (e) => {
    e.preventDefault(); e.stopPropagation();
    actions.toggleWatchlist(it);
    toast(saved ? `Removed ${it.title} from your watchlist` : `Added ${it.title} to your watchlist`, () => actions.toggleWatchlist(it));
  };
  // prefetch only when the pointer rests on the card, not while sweeping past it
  const intent = () => { clearTimeout(hover.current); hover.current = setTimeout(() => prefetch(it), 120); };
  return (
    <a className="card" href={isPerson ? `#/person/${it.id}` : `#/title/${it.type}/${it.id}`}
      onPointerEnter={intent} onPointerLeave={() => clearTimeout(hover.current)} onFocus={intent}>
      <div className="poster">
        {it.poster ? <img loading="lazy" src={IMG(it.poster)} alt="" /> : <div className="noimg">{it.title}</div>}
        {badge && <span className="badge">{badge}</span>}
        {!isPerson && <button className={`quick ${saved ? 'on' : ''}`} onClick={toggle} aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'} title={saved ? 'In your watchlist' : 'Add to watchlist'}>{saved ? '✓' : '+'}</button>}
        {!isPerson && it.overview && <div className="peek"><b>{it.vote ? `★ ${it.vote.toFixed(1)}` : ''}</b><p>{it.overview}</p></div>}
      </div>
      <div className="ctitle">{it.title}</div>
      <div className="csub">{sub ?? (isPerson ? it.dept : [it.year, it.anime ? 'Anime' : it.kdrama ? 'K-Drama' : it.type === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join(' · '))}</div>
    </a>
  );
}

export const Row = ({ title, items, badge }) =>
  items?.length ? (
    <section className="row">
      <h2>{title}</h2>
      <div className="strip">{items.map((it) => <Card key={it.key} it={it} badge={badge?.(it)} />)}</div>
    </section>
  ) : null;

export function Trailer({ video, fallbackNote, onClose }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [onClose]);
  return createPortal(
    <div className="modal" onClick={onClose}>
      <div className="player" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
        <div className="frame">
          {video ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&playsinline=1&rel=0`}
              title={video.name} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
            />
          ) : <div className="novid">No trailer available</div>}
        </div>
        {fallbackNote && <p className="note">{fallbackNote}</p>}
      </div>
    </div>,
    document.body
  );
}

export const Stars = ({ value = 0, onChange }) => (
  <span className="stars">
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} className={n <= value ? 'on' : ''} onClick={() => onChange(n)} aria-label={`${n} stars`}>★</button>
    ))}
  </span>
);

// Friendly error panel. 404s get the "not found" page; network/server problems get a retry button.
export function Err({ error, onRetry }) {
  const m = error?.message || '';
  if (m === 'NO_BACKEND')
    return <div className="state"><h2>Backend not configured</h2><p>Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (or your host's environment variables) and rebuild.</p></div>;
  if (/404/.test(m)) return <NotFound what="title" />;
  const offline = /fetch|network|send a request|Failed/i.test(m) || (typeof navigator !== 'undefined' && !navigator.onLine);
  return (
    <div className="state">
      <div className="bigicon">{offline ? '📡' : '⚠️'}</div>
      <h2>{offline ? "Can't reach the server" : 'Something went wrong'}</h2>
      <p>{offline ? 'Check your internet connection and try again.' : 'We hit a problem loading this. It may be temporary.'}</p>
      <div className="actions">
        {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
        <a className="btn ghost" href="#/">Go home</a>
      </div>
      {m && !offline && <small className="muted">{m}</small>}
    </div>
  );
}

export const NotFound = ({ what = 'page' }) => (
  <div className="state">
    <div className="bigicon">🎬</div>
    <h1>404</h1>
    <h2>We couldn't find that {what}</h2>
    <p>It may have been removed, or the link might be wrong.</p>
    <div className="actions"><a className="btn" href="#/">Back to Discover</a></div>
  </div>
);

// Crash fallback so a bug shows a page instead of a blank screen.
export class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <div className="state">
        <div className="bigicon">💥</div>
        <h2>The app hit an unexpected error</h2>
        <p>Reloading usually fixes it.</p>
        <button className="btn" onClick={() => location.reload()}>Reload</button>
      </div>
    ) : this.props.children;
  }
}

// ---- Loading skeletons (shapes match the real content so the page doesn't jump) ----
export const SkeletonGrid = ({ n = 12 }) => (
  <div className="grid" aria-busy="true" aria-label="Loading">
    {Array.from({ length: n }, (_, i) => (
      <div key={i}><div className="poster sk" /><div className="sk line" style={{ width: '80%', marginTop: 8 }} /><div className="sk line short" /></div>
    ))}
  </div>
);
export const SkeletonRow = ({ n = 8 }) => (
  <div className="strip" aria-busy="true">{Array.from({ length: n }, (_, i) => <div key={i} className="card"><div className="poster sk" /><div className="sk line" style={{ marginTop: 8 }} /></div>)}</div>
);
export const SkeletonHero = () => (
  <div className="hero" aria-busy="true" aria-label="Loading">
    <div className="hposter sk" />
    <div className="info">
      <div className="sk line title" /><div className="sk line short" />
      <div className="sk line" /><div className="sk line" /><div className="sk line" style={{ width: '60%' }} />
      <div className="actions"><div className="sk btnsk" /><div className="sk btnsk" /></div>
    </div>
  </div>
);
export const SkeletonEpisodes = ({ n = 5 }) => (
  <div aria-busy="true" aria-label="Loading episodes">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="ep"><div className="still sk" /><div className="epbody"><div className="sk line" style={{ width: '45%' }} /><div className="sk line" /><div className="sk line" style={{ width: '70%' }} /></div></div>
    ))}
  </div>
);
export const SkeletonRecs = ({ n = 4 }) => (
  <div className="recs" aria-busy="true" aria-label="Loading recommendations">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="rec"><div className="sk" style={{ width: 100, height: 150, flex: 'none' }} /><div style={{ flex: 1 }}><div className="sk line short" /><div className="sk line title" /><div className="sk line" /><div className="sk line" style={{ width: '80%' }} /></div></div>
    ))}
  </div>
);

// Follows the system theme until the user picks one; the choice is remembered.
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
export function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || (systemDark() ? 'dark' : 'light'));
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
    setTheme(next);
  };
  return <button className="themebtn" onClick={flip} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-label="Toggle theme">{theme === 'dark' ? '☀' : '☾'}</button>;
}
