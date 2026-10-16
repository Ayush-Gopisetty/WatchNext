import { useHash, ThemeToggle, NotFound, ErrorBoundary, Toaster } from './ui';
import SearchBox from './SearchBox';
import { Home, Search, Library, ForYou, Settings } from './pages';
import Detail from './Detail';
import Episode from './Episode';
import Auth from './Auth';
import Person from './Person';
import Login, { ResetPassword } from './Login';

export default function App() {
  const h = useHash();
  const parts = h.replace(/^#\/?/, '').split('/');
  let page;
  if (parts[0] === 'title' && parts[1] === 'tv' && parts[3] === 'season' && parts[5] === 'episode') page = <Episode key={h} id={parts[2]} s={+parts[4]} e={+parts[6]} />;
  else if (parts[0] === 'title') page = <Detail key={h} type={parts[1]} id={parts[2]} />;
  else if (parts[0] === 'person') page = <Person key={h} id={parts[1]} />;
  else if (parts[0] === 'search') page = <Search q={decodeURIComponent(parts[1] || '')} />;
  else if (parts[0] === 'library') page = <Library />;
  else if (parts[0] === 'foryou') page = <ForYou />;
  else if (parts[0] === 'reset') page = <ResetPassword />;
  else if (parts[0] === 'login') page = <Login />;
  else if (parts[0] === 'settings') page = <Settings />;
  else if (parts[0] === '' || parts[0] === 'browse' || parts[0].startsWith('access_token')) page = <Home />;
  else page = <NotFound />;
  const on = (p) => (parts[0] === p || (p === '' && parts[0] === 'browse') ? 'on' : '');
  const home = parts[0] === '' || parts[0] === 'browse'; // moving between Discover tabs keeps the page mounted
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
        <SearchBox />
        <ThemeToggle />
        <Auth />
      </header>
      <main key={home ? 'home' : h} className="page"><ErrorBoundary>{page}</ErrorBoundary></main>
      <footer>This product uses the TMDB API but is not endorsed or certified by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>.</footer>
      <nav className="tabbar" aria-label="Main">
        {[['', '🏠', 'Discover'], ['foryou', '✨', 'For you'], ['library', '📚', 'My list'], ['settings', '⚙️', 'Settings']].map(([k, ic, l]) => (
          <a key={k} className={on(k)} href={`#/${k}`}><span className="ic">{ic}</span>{l}</a>
        ))}
      </nav>
      <Toaster />
    </>
  );
}
