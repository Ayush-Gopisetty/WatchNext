import { useState, useEffect, useRef } from 'react';
import { IMG } from './api';
import { useLibrary, actions } from './store';
import { toast } from './ui';

// Your ten best matches as a slideshow: one big card at a time, with Interested / Not interested on each.
// The deck is fixed when the recommendations load, so deciding on a title never reshuffles the slides.
export default function TopTen({ recs }) {
  const lib = useLibrary();
  const pick = () => recs.filter((r) => !lib.items[r.key]?.dismissed).slice(0, 10);
  const [deck, setDeck] = useState(pick);
  const [i, setI] = useState(0);
  const [choice, setChoice] = useState({}); // key -> 'yes' | 'no'
  const timer = useRef();
  const touchX = useRef(null);

  useEffect(() => { setDeck(pick()); setI(0); setChoice({}); }, [recs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);

  const last = deck.length; // the summary slide
  const go = (n) => setI(Math.max(0, Math.min(last, n)));

  // Set the end state explicitly rather than toggling, so switching your mind never leaves both flags on.
  const decide = (r, want) => {
    const me = lib.items[r.key] || {};
    const next = choice[r.key] === want ? null : want; // clicking the same button again undoes it
    if (next === 'yes') {
      if (me.dismissed) actions.dismiss(r);
      if (!me.watchlist) actions.toggleWatchlist(r);
    } else if (next === 'no') {
      if (me.watchlist) actions.toggleWatchlist(r);
      if (!me.dismissed) actions.dismiss(r);
    } else if (want === 'yes' && me.watchlist) actions.toggleWatchlist(r);
    else if (want === 'no' && me.dismissed) actions.dismiss(r);
    setChoice((c) => ({ ...c, [r.key]: next }));
    if (next) {
      toast(next === 'yes' ? `Added ${r.title} to your watchlist` : `Hidden ${r.title}`);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => go(deck.indexOf(r) + 1), 450);
    }
  };

  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
  };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
  };

  if (!deck.length) return null;
  const yes = deck.filter((r) => choice[r.key] === 'yes').length;
  const no = deck.filter((r) => choice[r.key] === 'no').length;

  return (
    <section className="top10" aria-roledescription="carousel" aria-label="Your top 10" tabIndex={0} onKeyDown={onKey}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
      <h2>Your top 10 <small>{Math.min(i + 1, last)} / {last}</small></h2>
      <div className="t10view">
        <div className="t10track" style={{ transform: `translateX(-${i * 100}%)` }}>
          {deck.map((r, n) => (
            <article key={r.key} className="t10slide" aria-roledescription="slide" aria-label={`${n + 1} of ${last}`} aria-hidden={n !== i} inert={n !== i ? '' : undefined}
              style={{ backgroundImage: `url(${IMG(r.backdrop || r.poster, 'w780')})` }}>
              <div className="t10shade" />
              <div className="t10body">
                <span className="t10rank">#{n + 1}</span>
                <div className="match">{r.match}% match{n === 0 && ' · Watch this next'}</div>
                <h3>{r.title} <small>{r.year}</small></h3>
                <p className="t10why">Because you watched {r.because.slice(0, 3).join(', ')}</p>
                <p className="t10ov">{r.overview}</p>
                <div className="t10actions">
                  <button className={`btn ${choice[r.key] === 'yes' ? 'on' : ''}`} aria-pressed={choice[r.key] === 'yes'} onClick={() => decide(r, 'yes')}>
                    {choice[r.key] === 'yes' ? '✓ Interested' : '+ Interested'}
                  </button>
                  <button className={`btn ghost ${choice[r.key] === 'no' ? 'on-no' : ''}`} aria-pressed={choice[r.key] === 'no'} onClick={() => decide(r, 'no')}>
                    {choice[r.key] === 'no' ? '✕ Not interested' : 'Not interested'}
                  </button>
                  <a className="btn ghost" href={`#/title/${r.type}/${r.id}`}>Details</a>
                </div>
              </div>
            </article>
          ))}
          <article className="t10slide t10end" aria-roledescription="slide" aria-label={`${last + 1} of ${last + 1}`} aria-hidden={i !== last} inert={i !== last ? '' : undefined}>
            <div className="t10body">
              <h3>That's your top 10</h3>
              <p className="t10ov">{yes} added to your watchlist · {no} hidden · {deck.length - yes - no} skipped</p>
              <div className="t10actions">
                <a className="btn" href="#/library">Open my list</a>
                <button className="btn ghost" onClick={() => go(0)}>Review again</button>
              </div>
            </div>
          </article>
        </div>
        <button className="t10nav prev" aria-label="Previous" disabled={i === 0} onClick={() => go(i - 1)}>‹</button>
        <button className="t10nav next" aria-label="Next" disabled={i === last} onClick={() => go(i + 1)}>›</button>
      </div>
      <div className="t10dots">
        {[...deck, null].map((r, n) => (
          <button key={r?.key || 'end'} aria-label={r ? `Go to ${r.title}` : 'Go to summary'} aria-current={n === i}
            className={`${n === i ? 'on' : ''} ${choice[r?.key] || ''}`} onClick={() => go(n)} />
        ))}
      </div>
    </section>
  );
}
