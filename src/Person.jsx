import { useState } from 'react';
import { person, IMG } from './api';
import { Row, Err, useAsync, SkeletonHero, SkeletonRow } from './ui';
import { useLibrary, isStarted } from './store';
import { GENRES } from './recommend';

const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const age = (b, d) => {
  const end = d ? new Date(d) : new Date();
  const s = new Date(b);
  let a = end.getFullYear() - s.getFullYear();
  if (end < new Date(end.getFullYear(), s.getMonth(), s.getDate())) a--;
  return a;
};

export default function Person({ id }) {
  const { data: p, error, loading, retry } = useAsync(() => person(id), [id]);
  const { items } = useLibrary();
  const [kind, setKind] = useState('all');
  const [appearances, setAppearances] = useState(false);
  const [more, setMore] = useState(false);
  if (error) return <Err error={error} onRetry={retry} />;
  if (loading) return <><SkeletonHero /><section className="row"><div className="sk line title" /><SkeletonRow /></section></>;

  const roles = p.cast.filter((c) => appearances || !c.appearance);
  const shown = roles
    .filter((c) => kind === 'all' || (kind === 'anime' ? c.anime : kind === 'movie' ? c.type === 'movie' : c.type === 'tv' && !c.anime))
    .sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999')); // newest first, undated (upcoming) on top
  const knownFor = [...roles].filter((c) => c.poster).sort((a, b) => b.popularity - a.popularity).slice(0, 12);
  const watched = roles.filter((c) => isStarted(items[c.key] || {})).length;
  const byYear = shown.reduce((m, c) => { const y = c.date.slice(0, 4) || 'TBA'; (m[y] ||= []).push(c); return m; }, {});
  const years = Object.keys(byYear).sort((a, b) => (a === 'TBA' ? -1 : b === 'TBA' ? 1 : b - a));
  const crewJobs = p.crew.reduce((m, c) => { (m[c.job] ||= []).push(c); return m; }, {});
  const bio = p.bio || 'No biography available.';

  return (
    <>
      <div className="hero person">
        {p.photo ? <img className="hposter" src={IMG(p.photo, 'w342')} alt="" /> : <div className="hposter noimg" />}
        <div className="info">
          <h1>{p.name}</h1>
          <p className="meta">{[p.dept, p.birthplace].filter(Boolean).join(' · ')}</p>
          <dl className="facts">
            {p.birthday && <><dt>Born</dt><dd>{fmt(p.birthday)}{!p.deathday && ` (age ${age(p.birthday)})`}</dd></>}
            {p.deathday && <><dt>Died</dt><dd>{fmt(p.deathday)} (age {age(p.birthday, p.deathday)})</dd></>}
            {p.aka.length > 0 && <><dt>Also known as</dt><dd>{p.aka.join(', ')}</dd></>}
            <dt>Credits</dt><dd>{roles.length} acting{p.crew.length ? `, ${new Set(p.crew.map((c) => c.key)).size} behind the camera` : ''}</dd>
            {watched > 0 && <><dt>You've seen</dt><dd className="seen">{watched} of {roles.length} of their titles</dd></>}
          </dl>
          <p className={`bio ${more ? '' : 'clamp'}`}>{bio}</p>
          {bio.length > 400 && <button className="link" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Read more'}</button>}
          <div className="actions">
            {p.imdb && <a className="btn ghost" target="_blank" rel="noreferrer" href={`https://www.imdb.com/name/${p.imdb}`}>IMDb</a>}
            {p.instagram && <a className="btn ghost" target="_blank" rel="noreferrer" href={`https://www.instagram.com/${p.instagram}`}>Instagram</a>}
            <a className="btn ghost" target="_blank" rel="noreferrer" href={`https://www.themoviedb.org/person/${p.id}`}>TMDB</a>
          </div>
        </div>
      </div>

      <Row title="Known for" items={knownFor} />

      <section className="row">
        <h2>Filmography</h2>
        <div className="tabs">
          {[['all', 'All'], ['movie', 'Movies'], ['tv', 'Shows'], ['anime', 'Anime']].map(([k, l]) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>))}
          <label className="check small"><input type="checkbox" checked={appearances} onChange={(e) => setAppearances(e.target.checked)} /> Include talk shows &amp; appearances as self</label>
        </div>
        {shown.length === 0 ? <div className="empty">No credits in this category.</div> : years.map((y) => (
          <div key={y} className="yearblock">
            <div className="year">{y}</div>
            <div className="credits">
              {byYear[y].map((c) => {
                const mine = items[c.key];
                return (
                  <a key={c.key} className="credit" href={`#/title/${c.type}/${c.id}`}>
                    {c.poster ? <img loading="lazy" src={IMG(c.poster, 'w92')} alt="" /> : <div className="noimg" />}
                    <div>
                      <b>{c.title}</b>
                      <span>{[c.character && `as ${c.character}`, c.episodes && `${c.episodes} episode${c.episodes > 1 ? 's' : ''}`].filter(Boolean).join(' · ') || ' '}</span>
                      <small>{[c.anime ? 'Anime' : c.type === 'movie' ? 'Movie' : 'Series', c.genres.slice(0, 2).map((g) => GENRES[g]).filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</small>
                    </div>
                    {mine && isStarted(mine) && <span className="tag">✓ Watched</span>}
                    {mine?.watchlist && !isStarted(mine) && <span className="tag wl">In watchlist</span>}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {Object.keys(crewJobs).length > 0 && (
        <section className="row">
          <h2>Behind the camera</h2>
          {Object.entries(crewJobs).sort((a, b) => b[1].length - a[1].length).slice(0, 4).map(([job, list]) => (
            <div key={job} className="crewjob">
              <h3>{job} <small>({list.length})</small></h3>
              <div className="strip">{list.sort((a, b) => b.popularity - a.popularity).slice(0, 12).map((it) => (
                <a key={it.key} className="card" href={`#/title/${it.type}/${it.id}`}>
                  <div className="poster">{it.poster ? <img loading="lazy" src={IMG(it.poster)} alt="" /> : <div className="noimg">{it.title}</div>}</div>
                  <div className="ctitle">{it.title}</div><div className="csub">{it.date.slice(0, 4)}</div>
                </a>))}</div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
