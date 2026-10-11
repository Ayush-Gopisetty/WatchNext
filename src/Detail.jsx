import { useState } from 'react';
import { details, season, episodeVideos, IMG } from './api';
import { Row, Trailer, Stars, Err, useAsync } from './ui';
import { useLibrary, actions, epKey, epCount } from './store';

export default function Detail({ type, id }) {
  const { data: d, error, loading } = useAsync(() => details(type, id), [type, id]);
  const lib = useLibrary();
  const [trailer, setTrailer] = useState(null);
  if (error) return <Err error={error} />;
  if (loading) return <div className="empty">Loading…</div>;
  const me = lib.items[d.key] || {};
  return (
    <>
      <div className="hero" style={{ backgroundImage: d.backdrop ? `linear-gradient(rgba(10,10,14,.5), rgba(10,10,14,.92)), url(${IMG(d.backdrop, 'w1280')})` : undefined }}>
        <img className="hposter" src={IMG(d.poster, 'w342')} alt="" />
        <div className="info">
          <h1>{d.title} <small>{d.year}</small></h1>
          {d.tagline && <p className="muted">{d.tagline}</p>}
          <p className="meta">{[d.anime ? 'Anime' : d.type === 'movie' ? 'Movie' : 'Series', d.genreNames.join(', '), d.runtime && `${d.runtime} min`, d.vote && `★ ${d.vote.toFixed(1)}`].filter(Boolean).join(' · ')}</p>
          <p>{d.overview}</p>
          <div className="actions">
            <button className="btn" onClick={() => setTrailer({ video: d.trailer })}>▶ Trailer</button>
            {d.type === 'movie'
              ? <button className={`btn ${me.watched ? 'on' : 'ghost'}`} onClick={() => actions.toggleMovie(d)}>{me.watched ? '✓ Watched' : 'Mark watched'}</button>
              : <span className="muted">{epCount(me)}/{d.totalEpisodes} episodes watched</span>}
            <button className={`btn ${me.watchlist ? 'on' : 'ghost'}`} onClick={() => actions.toggleWatchlist(d)}>{me.watchlist ? '✓ In watchlist' : '+ Watchlist'}</button>
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

function Seasons({ d, me, onPlay, shield }) {
  const [sn, setSn] = useState(() => {
    // open on the season you're currently in
    const eps = Object.keys(me.eps || {}).map((k) => +k.split('x')[0]);
    return eps.length ? Math.max(...eps) : d.seasons[0]?.season_number ?? 1;
  });
  const { data, error, loading } = useAsync(() => season(d.id, sn), [d.id, sn]);
  const watched = (s, e) => !!me.eps?.[epKey(s, e)];

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
      <div className="tabs">{d.seasons.map((s) => (
        <button key={s.season_number} className={sn === s.season_number ? 'on' : ''} onClick={() => setSn(s.season_number)}>
          {s.name.length > 12 ? `S${s.season_number}` : s.name}
        </button>))}</div>
      {error ? <Err error={error} /> : loading ? <div className="empty">Loading episodes…</div> : (
        <>
          <div className="bulk">
            <button className="link" onClick={() => actions.setEpisodes(d, data.episodes.map((e) => [sn, e.episode_number]), true)}>Mark season watched</button>
            <button className="link" onClick={() => actions.setEpisodes(d, data.episodes.map((e) => [sn, e.episode_number]), false)}>Clear season</button>
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
                  <h4>{ep.episode_number}. {ep.name} <small>{[ep.air_date, ep.runtime && `${ep.runtime}m`, ep.vote_average > 0 && `★ ${ep.vote_average.toFixed(1)}`].filter(Boolean).join(' · ')}</small></h4>
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
