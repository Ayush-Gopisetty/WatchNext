import { useState, useEffect } from 'react';
import { browse, search, details, IMG, GENRES, genreFits } from './api';
import { Card, Row, Err, useAsync, usePaged, LoadMore, SkeletonGrid, SkeletonRecs } from './ui';
import { useLibrary, actions, epCount, isFinished, isStarted } from './store';
import { recommend, tasteProfile } from './recommend';

const DROP = ['movie', 'tv', 'anime']; // tabs that open a genre menu
const TABS = [['all', 'Trending'], ['movie', 'Movies'], ['tv', 'Shows'], ['anime', 'Anime'], ['top', 'Top rated']];

export function Home() {
  const lib = useLibrary();
  const [tab, setTab] = useState('all');
  const [genre, setGenre] = useState(null);
  const paged = usePaged((n) => browse(tab, n, genre), [tab, genre]);
  const [menu, setMenu] = useState(null); // { k, top, left } of the open genre menu
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e) => e.key === 'Escape' && close();
    addEventListener('click', close); addEventListener('scroll', close, true); addEventListener('resize', close); addEventListener('keydown', esc);
    return () => { removeEventListener('click', close); removeEventListener('scroll', close, true); removeEventListener('resize', close); removeEventListener('keydown', esc); };
  }, [menu]);
  const pick = (k, g) => { setTab(k); setGenre(g); setMenu(null); };
  const openMenu = (e, k) => {
    e.stopPropagation();
    if (menu?.k === k) return setMenu(null);
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ k, top: r.bottom + 6, left: Math.max(8, Math.min(r.left, innerWidth - 188)) });
  };
  const started = Object.values(lib.items).filter((i) => i.type === 'tv' && isStarted(i)).sort((a, b) => b.updatedAt - a.updatedAt);
  // ask TMDB (cached) how many episodes each followed show has now, to spot newly released ones
  const { data: latest } = useAsync(
    () => Promise.all(started.slice(0, 15).map((i) => details('tv', i.id).then((d) => [i.key, d.totalEpisodes]).catch(() => null)))
      .then((r) => Object.fromEntries(r.filter(Boolean))),
    [started.slice(0, 15).map((i) => i.key).join()],
  );
  const fresh = started.filter((i) => i.total > 0 && latest?.[i.key] > i.total);
  const freshKeys = new Set(fresh.map((i) => i.key));
  const resume = started.filter((i) => !isFinished(i) && !freshKeys.has(i.key));
  return (
    <>
      <Row title="New episodes" items={fresh} badge={(i) => `${latest[i.key] - i.total} new`} />
      <Row title="Continue watching" items={resume} badge={(i) => `${epCount(i)}/${i.total || '?'}`} />
      <div className="tabs">{TABS.map(([k, l]) => DROP.includes(k) ? (
        <button key={k} className={`dd ${tab === k ? 'on' : ''}`} aria-haspopup="listbox" aria-expanded={menu?.k === k} onClick={(e) => openMenu(e, k)}>
          {l}{tab === k && genre ? ` · ${genre}` : ''} <span aria-hidden>▾</span>
        </button>
      ) : <button key={k} className={tab === k ? 'on' : ''} onClick={() => pick(k, null)}>{l}</button>)}</div>
      {menu && (
        <ul className="ddmenu" role="listbox" style={{ top: menu.top, left: menu.left }} onClick={(e) => e.stopPropagation()}>
          <li><button className={tab === menu.k && !genre ? 'on' : ''} onClick={() => pick(menu.k, null)}>All {TABS.find(([k]) => k === menu.k)[1].toLowerCase()}</button></li>
          {GENRES.filter(([g]) => genreFits(g, menu.k)).map(([g]) => (
            <li key={g}><button className={tab === menu.k && genre === g ? 'on' : ''} onClick={() => pick(menu.k, g)}>{g}</button></li>
          ))}
        </ul>
      )}
      {paged.error && !paged.items.length ? <Err error={paged.error} onRetry={paged.retry} /> : !paged.items.length ? <SkeletonGrid /> : (
        <>
          <div className="grid">{paged.items.map((it) => <Card key={it.key} it={it} />)}</div>
          <LoadMore paged={paged} />
        </>
      )}
    </>
  );
}

export function Search({ q }) {
  const paged = usePaged((n) => search(q, n), [q]);
  const data = paged.items;
  return (
    <>
      <h2>Results for “{q}”</h2>
      {paged.error && !data.length ? <Err error={paged.error} onRetry={paged.retry} /> : paged.loading && !data.length ? <SkeletonGrid n={10} /> :
        data.length ? (
          <>
            <Row title="People" items={data.filter((x) => x.type === 'person').slice(0, 12)} />
            <div className="grid">{data.filter((x) => x.type !== 'person').map((it) => <Card key={it.key} it={it} />)}</div>
            <LoadMore paged={paged} />
          </>
        ) : <div className="state"><div className="bigicon">🔍</div><h2>No results for “{q}”</h2><p>Check the spelling or try a different title, actor or keyword.</p></div>}
    </>
  );
}

export function Library() {
  const { items } = useLibrary();
  const [f, setF] = useState('watching');
  const [kind, setKind] = useState('all');
  const KINDS = [['all', 'Everything'], ['tv', 'Shows'], ['movie', 'Movies'], ['anime', 'Anime']];
  const all = Object.values(items)
    .filter((i) => kind === 'all' || (kind === 'anime' ? i.anime : kind === 'movie' ? i.type === 'movie' : i.type === 'tv' && !i.anime))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const groups = {
    watching: all.filter((i) => i.type === 'tv' && isStarted(i) && !isFinished(i)),
    watchlist: all.filter((i) => i.watchlist && !isStarted(i)),
    finished: all.filter((i) => isFinished(i)),
  };
  const names = { watching: 'In progress', watchlist: 'Watchlist', finished: 'Finished' };
  return (
    <>
      <div className="tabs">{KINDS.map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      <div className="tabs">{Object.keys(groups).map((k) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{names[k]} ({groups[k].length})</button>)}</div>
      {groups[f].length ? (
        <div className="grid">
          {groups[f].map((it) => (
            <div key={it.key} className="libitem">
              <Card it={it} sub={it.type === 'tv' ? `${epCount(it)}/${it.total || '?'} episodes` : it.year} />
              {it.type === 'tv' && it.total > 0 && <div className="bar"><i style={{ width: `${Math.min(100, (epCount(it) / it.total) * 100)}%` }} /></div>}
            </div>
          ))}
        </div>
      ) : <div className="empty">Nothing here yet. Open a title and mark episodes or movies as watched, or add to your watchlist.</div>}
    </>
  );
}

export function ForYou() {
  const lib = useLibrary();
  const [kind, setKind] = useState('all');
  const sig = Object.values(lib.items).map((i) => `${i.key}${i.rating || ''}${isStarted(i) ? 1 : 0}${isFinished(i) ? 1 : 0}`).join();
  const { data, error, loading, retry } = useAsync(() => recommend(lib), [sig]);
  const profile = data?.profile || tasteProfile(Object.values(lib.items));
  if (error) return <Err error={error} onRetry={retry} />;
  const recs = (data?.recs || []).filter((r) => kind === 'all' || (kind === 'anime' ? r.anime : kind === 'movie' ? r.type === 'movie' : r.type === 'tv' && !r.anime));
  return (
    <>
      <section className="dna">
        <h2>Your taste</h2>
        {profile.genres.length ? profile.genres.slice(0, 6).map((g) => (
          <div key={g.id} className="dnarow"><span>{g.name}</span><div className="dnabar"><i className={g.score < 0 ? 'neg' : ''} style={{ width: `${Math.abs(g.score) * 100}%` }} /></div></div>
        )) : <p className="muted">Watch or rate a few things and your taste profile builds itself here.</p>}
      </section>
      <div className="tabs">{[['all', 'Everything'], ['tv', 'Shows'], ['movie', 'Movies'], ['anime', 'Anime']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      {loading ? <SkeletonRecs /> : !recs.length ? <div className="empty">Mark a few titles as watched (and rate them ★) to get recommendations.</div> : (
        <div className="recs">
          {recs.map((r, i) => (
            <a key={r.key} className="rec" href={`#/title/${r.type}/${r.id}`}>
              <img src={IMG(r.poster, 'w185')} alt="" />
              <div>
                <div className="match">{r.match}% match{i === 0 && ' · Watch this next'}</div>
                <h3>{r.title} <small>{r.year}</small></h3>
                <p className="why">Because you watched {r.because.slice(0, 3).join(', ')}</p>
                <p className="ov">{r.overview}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

export function Settings() {
  const { spoilerShield } = useLibrary();
  return (
    <div className="settings">
      <h2>Settings</h2>
      <label className="check"><input type="checkbox" checked={spoilerShield} onChange={(e) => actions.setShield(e.target.checked)} /> Spoiler shield: blur images and plots of episodes you haven't watched yet</label>
    </div>
  );
}
