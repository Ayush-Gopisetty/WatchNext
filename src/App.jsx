import { useState } from 'react';
import { useHash } from './ui';
import { Home, Search, Library, ForYou, Settings } from './pages';
import Detail from './Detail';
import Auth from './Auth';
import Person from './Person';
import Login, { ResetPassword } from './Login';

export default function App() {
  const h = useHash();
  const [q, setQ] = useState('');
  const parts = h.replace(/^#\/?/, '').split('/');
  let page;
  if (parts[0] === 'title') page = <Detail key={h} type={parts[1]} id={parts[2]} />;
  else if (parts[0] === 'person') page = <Person key={h} id={parts[1]} />;
  else if (parts[0] === 'search') page = <Search q={decodeURIComponent(parts[1] || '')} />;
  else if (parts[0] === 'library') page = <Library />;
  else if (parts[0] === 'foryou') page = <ForYou />;
  else if (parts[0] === 'reset') page = <ResetPassword />;
  else if (parts[0] === 'login') page = <Login />;
  else if (parts[0] === 'settings') page = <Settings />;
  else page = <Home />;
  const on = (p) => (parts[0] === p ? 'on' : '');
  return (
    <>
      <header>
        <a className="logo" href="#/">Watch<b>Next</b></a>
        <nav>
          <a className={on('')} href="#/">Discover</a>
          <a className={on('foryou')} href="#/foryou">For you</a>
          <a className={on('library')} href="#/library">My list</a>
          <a className={on('settings')} href="#/settings">⚙</a>
        </nav>
        <form onSubmit={(e) => { e.preventDefault(); q.trim() && (location.hash = `#/search/${encodeURIComponent(q.trim())}`); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies, shows, anime…" />
        </form>
        <Auth />
      </header>
      <main>{page}</main>
      <footer>This product uses the TMDB API but is not endorsed or certified by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>.</footer>
    </>
  );
}
