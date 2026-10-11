import { useEffect, useRef, useState } from 'react';
import { search, IMG } from './api';

const hrefOf = (r) => (r.type === 'person' ? `#/person/${r.id}` : `#/title/${r.type}/${r.id}`);

// Search with instant suggestions: type to see matches, arrow keys + Enter to jump, "/" to focus.
export default function SearchBox() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(-1);
  const inp = useRef();
  const seq = useRef(0);

  useEffect(() => {
    const f = (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); inp.current?.focus(); }
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRes([]); return; }
    const id = ++seq.current; // ignore answers that arrive out of order
    const h = setTimeout(() => search(t, 1).then((r) => { if (id === seq.current) { setRes(r.slice(0, 6)); setCur(-1); } }).catch(() => {}), 250);
    return () => clearTimeout(h);
  }, [q]);

  const full = `#/search/${encodeURIComponent(q.trim())}`;
  const go = (href) => { setOpen(false); inp.current?.blur(); location.hash = href; };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(c + 1, res.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(c - 1, -1)); }
    else if (e.key === 'Escape') { setOpen(false); inp.current.blur(); }
  };
  return (
    <form className="searchbox" onSubmit={(e) => { e.preventDefault(); q.trim() && go(cur >= 0 ? hrefOf(res[cur]) : full); }}>
      <input ref={inp} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey}
        placeholder="Search movies, shows, anime…  ( / )" aria-label="Search" autoComplete="off" />
      {open && q.trim().length >= 2 && res.length > 0 && (
        <ul className="suggest" onMouseDown={(e) => e.preventDefault()}>
          {res.map((r, i) => (
            <li key={r.key}>
              <a className={i === cur ? 'on' : ''} href={hrefOf(r)} onClick={() => setOpen(false)}>
                {r.poster ? <img src={IMG(r.poster, 'w92')} alt="" /> : <span className="sph" />}
                <span><b>{r.title}</b><small>{r.type === 'person' ? r.dept || 'Person' : [r.year, r.anime ? 'Anime' : r.type === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join(' · ')}</small></span>
              </a>
            </li>
          ))}
          <li><a className="all" href={full} onClick={() => setOpen(false)}>See all results for “{q.trim()}”</a></li>
        </ul>
      )}
    </form>
  );
}
