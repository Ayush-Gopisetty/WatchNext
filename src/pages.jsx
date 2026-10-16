import { useState, useEffect, useRef } from 'react';
import { browse, collection, COLLECTIONS, search, episodeTotal, IMG, GENRES, FLAVORS, genreFits } from './api';
import { Card, Row, Err, useAsync, useHash, usePaged, LoadMore, SkeletonGrid, SkeletonRecs, Stars, toast } from './ui';
import { useLibrary, actions, epCount, isFinished, isStarted, isAbandoned } from './store';
import { recommend, tasteProfile, weight } from './recommend';
import TopTen from './TopTen';

const DROP = ['all', 'movie', 'tv', 'anime', 'kdrama', 'top']; // tabs that open a genre menu and show one strip per genre
const LEAD = { all: 'Trending now', top: 'Top rated' }; // title of the first strip when no genre is picked
const TABS = [['all', 'Trending'], ['movie', 'Movies'], ['tv', 'Shows'], ['anime', 'Anime'], ['kdrama', 'K-Dramas'], ['top', 'Top rated']];

// Where you are on Discover lives in the URL, so back/forward work and a link to "Anime → Action" can be shared:
//   #/browse/anime  ·  #/browse/anime/genre/Action  ·  #/browse/anime/genre/Action/top  ·  #/browse/anime/all  ·  #/browse/all/c/short
const BLANK = { tab: 'all', genre: null, flavor: null, coll: null, full: false };
function parseBrowse(h) {
  const p = h.replace(/^#\/?/, '').split('/').map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  if (p[0] !== 'browse' || !TABS.some(([k]) => k === p[1])) return BLANK;
  const tab = p[1];
  if (p[2] === 'genre' && GENRES.some(([g]) => g === p[3])) {
    const flavor = FLAVORS.some(([f]) => f === p[4]) ? p[4] : null;
    return { ...BLANK, tab, genre: p[3], flavor, full: !!flavor };
  }
  if (p[2] === 'all') return { ...BLANK, tab, full: true };
  if (tab === 'all' && p[2] === 'c' && COLLECTIONS.some(([c]) => c === p[3])) return { ...BLANK, coll: p[3], full: true };
  return { ...BLANK, tab };
}
const enc = encodeURIComponent;
function browseHref({ tab, genre, flavor, coll, full }) {
  if (coll) return `#/browse/all/c/${coll}`;
  if (genre) return `#/browse/${tab}/genre/${enc(genre)}${flavor ? `/${flavor}` : ''}`;
  if (full) return `#/browse/${tab}/all`;
  return tab === 'all' ? '#/' : `#/browse/${tab}`;
}
const go = (to) => { location.hash = browseHref({ ...BLANK, ...to }); };

// One Netflix-style strip: loads its titles only once it scrolls near the viewport.
function GenreRow({ kind, genre, flavor, coll, title, onAll, rank }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  const { data, error } = useAsync(() => (seen ? (coll ? collection(coll, 1) : browse(kind, 1, genre, flavor)) : Promise.resolve(null)), [seen, kind, genre, flavor, coll]);
  if (error || (data && !data.length)) return null;
  return (
    <section className="row" ref={ref}>
      <div className="rowhead">
        <h2>{title}</h2>
        {onAll && <button className="link" onClick={onAll}>See all ›</button>}
      </div>
      <div className="strip">
        {data ? data.map((it, n) => <Card key={it.key} it={it} badge={rank ? `#${n + 1}` : undefined} />) : Array.from({ length: 8 }, (_, i) => <div key={i} className="sk rowsk" />)}
      </div>
    </section>
  );
}

export function Home() {
  const lib = useLibrary();
  const { tab, genre, flavor, coll, full } = parseBrowse(useHash()); // full → the complete paged grid instead of strips
  const sections = DROP.includes(tab) && !genre && !full; // Movies/Shows/Anime with no genre picked → one strip per genre
  const strips = DROP.includes(tab) && !full;
  const paged = usePaged((n) => (strips ? Promise.resolve([]) : coll ? collection(coll, n) : browse(tab, n, genre, flavor)), [tab, genre, flavor, strips, coll]);
  const [menu, setMenu] = useState(null); // { k, top, left } of the open genre menu
  useEffect(() => {
    if (!menu) return;
    const born = Date.now();
    // the browser may scroll a half-hidden tab into view as it's tapped; don't treat that as the user scrolling away
    const close = (e) => !(e?.type === 'scroll' && Date.now() - born < 400) && setMenu(null);
    const esc = (e) => e.key === 'Escape' && close();
    addEventListener('click', close); addEventListener('scroll', close, true); addEventListener('resize', close); addEventListener('keydown', esc);
    return () => { removeEventListener('click', close); removeEventListener('scroll', close, true); removeEventListener('resize', close); removeEventListener('keydown', esc); };
  }, [menu]);
  const pick = (k, g) => { setMenu(null); go({ tab: k, genre: g }); };
  const seeAll = (g, f) => go({ tab, genre: g, flavor: f, full: true });
  const openMenu = (e, k) => {
    e.stopPropagation();
    if (menu?.k === k) return setMenu(null);
    e.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ k, top: r.bottom + 6, left: Math.max(8, Math.min(r.left, innerWidth - 188)) });
  };
  const started = Object.values(lib.items).filter((i) => i.type === 'tv' && isStarted(i)).sort((a, b) => b.updatedAt - a.updatedAt);
  // ask TMDB (cached) how many episodes each followed show has now, to spot newly released ones
  const { data: latest } = useAsync(
    () => Promise.all(started.slice(0, 15).map((i) => episodeTotal(i.id).then((n) => [i.key, n]).catch(() => null)))
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
      {sections ? (
        <>
          {tab === 'all' && <GenreRow key="top10" kind="all" coll="top10" rank title="Top 10 this week" onAll={() => seeAll(null, null)} />}
          {tab !== 'all' && <GenreRow key={`${tab}-popular`} kind={tab} genre={null} title={LEAD[tab] || `Popular ${TABS.find(([k]) => k === tab)[1].toLowerCase()}`} onAll={() => seeAll(null, null)} />}
          {tab === 'all' && COLLECTIONS.filter(([c]) => c !== 'top10').map(([c, l]) => (
            <GenreRow key={c} kind="all" coll={c} title={l} onAll={() => go({ coll: c })} />
          ))}
          {GENRES.filter(([g]) => genreFits(g, tab)).map(([g]) => (
            <GenreRow key={`${tab}-${g}`} kind={tab} genre={g} title={g} onAll={() => pick(tab, g)} />
          ))}
        </>
      ) : genre && strips ? (
        <>
          <h1 className="genrehead">{genre} {TABS.find(([k]) => k === tab)[1].toLowerCase()}</h1>
          {FLAVORS.map(([f, l]) => <GenreRow key={`${tab}-${genre}-${f}`} kind={tab} genre={genre} flavor={f} title={`${l} ${genre.toLowerCase()}`} onAll={() => seeAll(genre, f)} />)}
        </>
      ) : paged.error && !paged.items.length ? <Err error={paged.error} onRetry={paged.retry} /> : !paged.items.length ? <SkeletonGrid /> : (
        <>
          {full && (
            <div className="fullhead">
              <button className="link" onClick={() => (coll ? go({}) : genre ? go({ tab, genre }) : go({ tab }))}>‹ Back</button>
              <h1 className="genrehead">{coll ? COLLECTIONS.find(([c]) => c === coll)[1] : [flavor && FLAVORS.find(([f]) => f === flavor)[1], genre, genre ? '' : 'All', TABS.find(([k]) => k === tab)[1].toLowerCase()].filter((x) => x !== '' && x !== null).join(' ')}</h1>
            </div>
          )}
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
  const KINDS = [['all', 'Everything'], ['tv', 'Shows'], ['movie', 'Movies'], ['anime', 'Anime'], ['kdrama', 'K-Dramas']];
  const all = Object.values(items)
    .filter((i) => kind === 'all' || (kind === 'anime' ? i.anime : kind === 'kdrama' ? i.kdrama : kind === 'movie' ? i.type === 'movie' : i.type === 'tv' && !i.anime && !i.kdrama))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const groups = {
    watching: all.filter((i) => i.type === 'tv' && isStarted(i) && !isFinished(i)),
    watchlist: all.filter((i) => i.watchlist && !isStarted(i)),
    finished: all.filter((i) => isFinished(i)),
    rated: all.filter((i) => i.rating > 0),
  };
  const names = { watching: 'In progress', watchlist: 'Watchlist', finished: 'Finished', rated: 'Rated' };
  return (
    <>
      <div className="tabs">{KINDS.map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      <div className="tabs">{Object.keys(groups).map((k) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{names[k]} ({groups[k].length})</button>)}</div>
      {groups[f].length ? (
        <div className="grid">
          {groups[f].map((it) => (
            <div key={it.key} className="libitem">
              <Card it={it} sub={it.type === 'tv' ? `${epCount(it)}/${it.total || '?'} episodes` : it.year} />
              {f === 'rated' && <Stars value={it.rating} onChange={(n) => actions.rate(it, n)}
                onClear={() => { const was = it.rating; actions.rate(it, 0); toast(`Cleared rating for ${it.title}`, () => actions.rate(it, was)); }} />}
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
  const liked = profile.genres.filter((g) => g.score > 0.05); // the bars are things you like; dislikes get their own line
  // "Showing less of" only reflects what you explicitly marked (low ratings, Not interested), never inferred drop-offs.
  const explicit = Object.values(lib.items).filter((i) => !isAbandoned(i) || i.dismissed);
  const disliked = tasteProfile(explicit).genres.filter((g) => g.score < -0.05);
  // Titles pulling the profile down, with the reason, so a "showing less of" line is never a mystery.
  const negatives = Object.values(lib.items).filter((i) => weight(i) < 0 && (!isAbandoned(i) || i.dismissed));
  const recs = (data?.recs || []).filter((r) => !lib.items[r.key]?.dismissed).filter((r) => kind === 'all' || (kind === 'anime' ? r.anime : kind === 'kdrama' ? r.kdrama : kind === 'movie' ? r.type === 'movie' : r.type === 'tv' && !r.anime && !r.kdrama));
  return (
    <>
      <section className="dna">
        <h2>Your taste</h2>
        {liked.length ? liked.slice(0, 6).map((g) => (
          <div key={g.id} className="dnarow"><span>{g.name}</span><div className="dnabar"><i className={g.score < 0 ? 'neg' : ''} style={{ width: `${Math.abs(g.score) * 100}%` }} /></div></div>
        )) : <p className="muted">Watch or rate a few things and your taste profile builds itself here.</p>}
        {disliked.length > 0 && (
          <details className="why-less">
            <summary className="muted">Showing less of: {disliked.slice(-3).reverse().map((g) => g.name).join(', ')} <u>Why?</u></summary>
            <ul>
              {negatives.map((it) => (
                <li key={it.key}>
                  <a href={`#/title/${it.type}/${it.id}`}>{it.title}</a>
                  <span className="muted"> · {it.rating ? `rated ${it.rating}★` : 'not interested'}</span>
                  {it.dismissed && !it.rating && <button className="clear" onClick={() => actions.dismiss(it)}>Undo</button>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {!loading && data?.recs.length > 0 && <TopTen recs={data.recs} />}
      <div className="tabs">{[['all', 'Everything'], ['tv', 'Shows'], ['movie', 'Movies'], ['anime', 'Anime'], ['kdrama', 'K-Dramas']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
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
              <button className="dismiss" aria-label={`Not interested in ${r.title}`} title="Not interested"
                onClick={(e) => { e.preventDefault(); actions.dismiss(r); toast(`Hidden ${r.title}`, () => actions.dismiss(r)); }}>✕</button>
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
