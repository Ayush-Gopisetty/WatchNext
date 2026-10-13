import { useEffect, useState } from 'react';
import { details, showLite, episode, episodeVideos, ratings, saveEpScore, IMG } from './api';
import { Trailer, Err, useAsync, SkeletonHero, toast } from './ui';
import { useLibrary, actions, epKey } from './store';
import { Scores } from './Detail';

// Full page for one episode, laid out like a movie's page.
export default function Episode({ id, s, e }) {
  const { data, error, loading, retry } = useAsync(
    () => Promise.all([showLite(id), episode(id, s, e)]).then(([show, ep]) => ({ show, ep })),
    [id, s, e],
  );
  const lib = useLibrary();
  const { data: scores } = useAsync(() => (data ? ratings(data.ep.imdbId) : null), [data?.ep.imdbId]);
  const [trailer, setTrailer] = useState(null);
  useEffect(() => { if (scores?.imdb?.score) saveEpScore(id, s, e, scores.imdb.score); }, [scores, id, s, e]);
  if (error) return <Err error={error} onRetry={retry} />;
  if (loading) return <SkeletonHero />;

  const { show, ep } = data;
  const me = lib.items[show.key] || {};
  const seen = !!me.eps?.[epKey(s, e)];
  const hide = lib.spoilerShield && !seen;
  // neighbours come from the season's episode count, so no extra season request is needed
  const count = show.seasons.find((x) => x.season_number === s)?.episode_count || 0;
  const prev = e > 1 ? e - 1 : null, next = e < count ? e + 1 : null;
  const href = (n) => `#/title/tv/${id}/season/${s}/episode/${n}`;

  const play = async () => {
    setTrailer({ video: null, fallbackNote: 'Looking for a preview…' });
    const v = ep.trailer || (await episodeVideos(id, s, e));
    // only now pay for the full show details, to get the series trailer
    setTrailer(v ? { video: v } : { video: (await details('tv', id).catch(() => null))?.trailer, fallbackNote: `No episode-specific preview exists for S${s}E${e}; showing the series trailer.` });
  };
  const writers = ep.writers.filter((w, k, a) => a.findIndex((x) => x.id === w.id) === k);
  const people = (list) => list.map((p, k) => <span key={p.id + p.job}>{k > 0 && ', '}<a href={`#/person/${p.id}`}>{p.name}</a></span>);

  return (
    <>
      <div className="hero" style={{ backgroundImage: show.backdrop ? `linear-gradient(rgba(10,10,14,.5), rgba(10,10,14,.92)), url(${IMG(show.backdrop, 'w1280')})` : undefined }}>
        {ep.still ? <img className={`hstill ${hide ? 'blur' : ''}`} src={IMG(ep.still, 'original')} alt="" /> : <img className="hposter" src={IMG(show.poster, 'w342')} alt="" />}
        <div className="info">
          <h1>{ep.number}. {ep.name} <small>S{s}E{e}</small></h1>
          <p className="muted"><a className="crumb" href={`#/title/tv/${id}`}>← {show.title} · Season {s}</a></p>
          <p className="meta">{['Episode', ep.airDate, ep.runtime && `${ep.runtime} min`, ep.vote > 0 && `★ ${ep.vote.toFixed(1)}`, ep.type && ep.type !== 'standard' && ep.type.replace(/_/g, ' ')].filter(Boolean).join(' · ')}</p>
          <Scores s={scores} />
          <p className={hide ? 'blur' : ''}>{ep.overview || 'No description yet.'}</p>
          {hide && ep.overview && <small className="muted">Spoiler shield on — mark watched to reveal.</small>}
          {(ep.directors.length > 0 || writers.length > 0) && (
            <dl className="facts">
              {ep.directors.length > 0 && <><dt>Directed by</dt><dd>{people(ep.directors)}</dd></>}
              {writers.length > 0 && <><dt>Written by</dt><dd>{people(writers)}</dd></>}
            </dl>
          )}
          <div className="actions">
            <button className="btn" onClick={play}>▶ Trailer</button>
            <button className={`btn ${seen ? 'on' : 'ghost'}`} onClick={() => {
              actions.toggleEpisode(show, s, e);
              toast(seen ? 'Marked unwatched' : 'Marked as watched', () => actions.toggleEpisode(show, s, e));
            }}>{seen ? '✓ Watched' : 'Mark watched'}</button>
          </div>
        </div>
      </div>
      <div className="epnav">
        {prev ? <a className="btn ghost" href={href(prev)}>← Episode {prev}</a> : <span />}
        {next ? <a className="btn ghost" href={href(next)}>Episode {next} →</a> : <span />}
      </div>
      {ep.cast.length > 0 && <section className="row"><h2>Cast &amp; guest stars</h2><div className="strip">{ep.cast.map((c) => (
        <a key={c.id} className="cast" href={`#/person/${c.id}`}>{c.profile_path ? <img src={IMG(c.profile_path, 'w185')} alt="" /> : <div className="noimg" />}<b>{c.name}</b><span>{c.character}</span></a>
      ))}</div></section>}
      {trailer && <Trailer {...trailer} onClose={() => setTrailer(null)} />}
    </>
  );
}
