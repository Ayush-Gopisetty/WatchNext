import { useEffect, useState } from 'react';
import { IMG } from './api';

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
  useEffect(() => {
    let live = true;
    setS({ loading: true });
    Promise.resolve().then(fn).then((data) => live && setS({ data }), (error) => live && setS({ error }));
    return () => { live = false; };
  }, deps); // eslint-disable-line
  return s;
}

// Paged list: fetchPage(n) -> array. Resets when deps change; loadMore() appends the next page.
export function usePaged(fetchPage, deps) {
  const [s, setS] = useState({ items: [], page: 0, loading: true, more: false });
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
  }, deps); // eslint-disable-line
  return { ...s, loadMore: () => run(s.page + 1, false) };
}

export const LoadMore = ({ paged }) =>
  paged.items.length && paged.more ? (
    <div className="more"><button className="btn ghost" disabled={paged.loading} onClick={paged.loadMore}>{paged.loading ? 'Loading…' : 'Load more'}</button></div>
  ) : null;

export function Card({ it, badge, sub }) {
  return (
    <a className="card" href={it.type === 'person' ? `#/person/${it.id}` : `#/title/${it.type}/${it.id}`}>
      <div className="poster">
        {it.poster ? <img loading="lazy" src={IMG(it.poster)} alt="" /> : <div className="noimg">{it.title}</div>}
        {badge && <span className="badge">{badge}</span>}
      </div>
      <div className="ctitle">{it.title}</div>
      <div className="csub">{sub ?? (it.type === 'person' ? it.dept : [it.year, it.anime ? 'Anime' : it.type === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join(' · '))}</div>
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
  return (
    <div className="modal" onClick={onClose}>
      <div className="player" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
        {video ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&rel=0`}
            title={video.name} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
          />
        ) : <div className="novid">No trailer available</div>}
        {fallbackNote && <p className="note">{fallbackNote}</p>}
      </div>
    </div>
  );
}

export const Stars = ({ value = 0, onChange }) => (
  <span className="stars">
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} className={n <= value ? 'on' : ''} onClick={() => onChange(n)} aria-label={`${n} stars`}>★</button>
    ))}
  </span>
);

export const Err = ({ error }) =>
  error.message === 'NO_BACKEND'
    ? <div className="empty">Backend not configured. Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart.</div>
    : <div className="empty">Something went wrong: {error.message}</div>;
