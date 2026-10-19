import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Scoreboard } from './components/Scoreboard';
import { GamePage } from './components/GamePage';
import './styles.css';

function route(): { game: string | null } {
  const m = location.hash.match(/^#\/g\/(\d+)/);
  return { game: m ? m[1] : null };
}

function App() {
  const [r, setR] = useState(route());
  useEffect(() => {
    const on = () => {
      setR(route());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r.game ? <GamePage key={r.game} id={r.game} /> : <Scoreboard />;
}

render(<App />, document.getElementById('app')!);
