import { useState } from 'react';
import { details, season, episodeVideos, ratings, savedEpScores, IMG } from './api';
import { Row, Trailer, Stars, Err, useAsync, SkeletonHero, SkeletonEpisodes, toast } from './ui';
import { useLibrary, actions, epKey, epCount } from './store';

export default function Detail({ type, id }) {
  const { data: d, error, loading, retry } = useAsync(() => details(type, id), [type, id]);
  const lib = useLibrary();
  const { data: scores } = useAsync(() => (d ? ratings(d.imdbId) : null), [d?.imdbId]);
  const [trailer, setTrailer] = useState(null);
  if (error) return <Err error={error} onRetry={retry} />;
  if (loading) return <SkeletonHero />;
  const me = lib.items[d.key] || {};
  return (
    <>
      <div className="hero" style={{ backgroundImage: d.backdrop ? `linear-gradient(rgba(10,10,14,.5), rgba(10,10,14,.92)), url(${IMG(d.backdrop, 'w1280')})` : undefined }}>
        <img className="hposter" src={IMG(d.poster, 'w342')} alt="" />
        <div className="info">
          <h1>{d.title} <small>{d.year}</small></h1>
          {d.tagline && <p className="muted">{d.tagline}</p>}
          <p className="meta">{d.cert && <span className="cert" title={d.cert.country === 'US' ? (d.type === 'movie' ? 'MPAA rating' : 'TV Parental Guidelines rating') : `Rating (${d.cert.country}) — no US rating on file`}>{d.cert.label}{d.cert.country !== 'US' && <small> {d.cert.country}</small>}</span>}{[d.anime ? 'Anime' : d.type === 'movie' ? 'Movie' : 'Series', d.genreNames.join(', '), d.runtime && `${d.runtime} min`, d.vote && `★ ${d.vote.toFixed(1)}`].filter(Boolean).join(' · ')}</p>
          <Scores s={scores} />
          <p>{d.overview}</p>
          <div className="actions">
            <button className="btn" onClick={() => setTrailer({ video: d.trailer })}>▶ Trailer</button>
            {d.type === 'movie'
              ? <button className={`btn ${me.watched ? 'on' : 'ghost'}`} onClick={() => actions.toggleMovie(d)}>{me.watched ? '✓ Watched' : 'Mark watched'}</button>
              : <span className="muted">{epCount(me)}/{d.totalEpisodes} episodes watched</span>}
            <button className={`btn ${me.watchlist ? 'on' : 'ghost'}`} onClick={() => { actions.toggleWatchlist(d); toast(me.watchlist ? 'Removed from your watchlist' : 'Added to your watchlist', () => actions.toggleWatchlist(d)); }}>{me.watchlist ? '✓ In watchlist' : '+ Watchlist'}</button>
            <Stars value={me.rating} onChange={(n) => actions.rate(d, n)} />
          </div>
        </div>
      </div>
      {d.type === 'tv' && <Seasons d={d} me={me} onPlay={setTrailer} shield={lib.spoilerShield} />}
      {d.cast.length > 0 && <section className="row"><h2>Cast</h2><div className="strip">{d.cast.map((c) => (
        <a key={c.id} className="cast" href={`#/person/${c.id}`}>{c.profile_path ? <img src={IMG(c.profile_path, 'w185')} alt="" /> : <div className="noimg" />}<b>{c.name}</b><span>{c.character}</span></a>
      ))}</div></section>}
      <Row title="More like this" items={d.recs.length ? d.recs : d.similar} />
      {trailer && <Trailer {...trailer} onClose={() => setTrailer(null)} />}
    </>
  );
}

// Critic/audience scores. Only the ones we actually have are shown; nothing renders if there are none.
export function Scores({ s }) {
  if (!s) return null;
  const mc = +s.metacritic?.score;
  const items = [
    ['rt', 'Rotten Tomatoes', s.rt && s.rt.score, parseInt(s.rt?.score) >= 60 ? 'good' : s.rt ? 'bad' : ''],
    ['imdb', 'IMDb', s.imdb && `${s.imdb.score}/10`, s.imdb?.votes ? `${s.imdb.votes} votes` : ''],
    ['mc', 'Metacritic', s.metacritic && s.metacritic.score, mc >= 61 ? 'good' : mc >= 40 ? 'mixed' : s.metacritic ? 'bad' : ''],
  ];
  const have = items.filter(([, , val]) => val);
  if (!have.length) return null;
  return (
    <div className="scores">
      {have.map(([k, label, val, tone]) => (
        <div key={k} className={`score ${k === 'imdb' ? '' : tone}`} title={label}>
          <b>{val}</b><span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Seasons({ d, me, onPlay, shield }) {
  const [sn, setSn] = useState(() => {
    // open on the season you're currently in
    const eps = Object.keys(me.eps || {}).map((k) => +k.split('x')[0]);
    return eps.length ? Math.max(...eps) : d.seasons[0]?.season_number ?? 1;
  });
  const { data, error, loading, retry } = useAsync(() => season(d.id, sn), [d.id, sn]);
  const imdb = savedEpScores(d.id);
  const watched = (s, e) => !!me.eps?.[epKey(s, e)];

  const markSeason = (on) => {
    const all = data.episodes.map((e) => [sn, e.episode_number]);
    const before = all.filter(([a, b]) => watched(a, b));
    actions.setEpisodes(d, all, on);
    toast(on ? `Season ${sn} marked as watched` : `Season ${sn} cleared`, () => { actions.setEpisodes(d, all, false); actions.setEpisodes(d, before, true); });
  };

  const play = async (ep) => {
    onPlay({ video: null, fallbackNote: 'Looking for a preview…' });
    const v = await episodeVideos(d.id, sn, ep.episode_number);
    if (v) return onPlay({ video: v });
    onPlay({
      video: d.trailer,
      fallbackNote: `No episode-specific preview exists for S${sn}E${ep.episode_number}; showing the series trailer.`,
    });
  };

  return (
    <section className="seasons">
      {d.seasons.length > 1 && (
        <select className="seasonpick" aria-label="Season" value={sn} onChange={(e) => setSn(+e.target.value)}>
          {d.seasons.map((s) => (
            <option key={s.season_number} value={s.season_number}>
              {s.name || `Season ${s.season_number}`}{s.episode_count ? ` · ${s.episode_count} episodes` : ''}
            </option>))}
        </select>
      )}
      {error ? <Err error={error} onRetry={retry} /> : loading ? <SkeletonEpisodes /> : (
        <>
          <div className="bulk">
            <button className="link" onClick={() => markSeason(true)}>Mark season watched</button>
            <button className="link" onClick={() => markSeason(false)}>Clear season</button>
          </div>
          {data.episodes.map((ep) => {
            const seen = watched(sn, ep.episode_number);
            const hide = shield && !seen;
            return (
              <div key={ep.id} className={`ep ${seen ? 'seen' : ''}`}>
                <div className={`still ${hide ? 'blur' : ''}`} onClick={() => play(ep)}>
                  {ep.still_path ? <img loading="lazy" src={IMG(ep.still_path, 'w300')} alt="" /> : <div className="noimg" />}
                  <span className="play">▶</span>
                </div>
                <div className="epbody">
                  <h4>{ep.episode_number}. <a className="eplink" href={`#/title/tv/${d.id}/season/${sn}/episode/${ep.episode_number}`}>{ep.name}</a> <small>{[ep.air_date, ep.runtime && `${ep.runtime}m`, ep.vote_average > 0 && `★ ${ep.vote_average.toFixed(1)}`, imdb[`${sn}x${ep.episode_number}`] && `IMDb ${imdb[`${sn}x${ep.episode_number}`]}`].filter(Boolean).join(' · ')}</small></h4>
                  <p className={hide ? 'blur' : ''}>{ep.overview || 'No description yet.'}</p>
                  {hide && ep.overview && <small className="muted">Spoiler shield on — mark watched to reveal.</small>}
                </div>
                <div className="epact">
                  <button className={`chk ${seen ? 'on' : ''}`} title="Watched" onClick={() => actions.toggleEpisode(d, sn, ep.episode_number)}>✓</button>
                  <button className="link" title="Marks this and every earlier episode of the season"
                    onClick={() => actions.setEpisodes(d, data.episodes.filter((e) => e.episode_number <= ep.episode_number).map((e) => [sn, e.episode_number]), true)}>up to here</button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
