import { render } from 'preact';
import { Scoreboard } from './components/Scoreboard';
import { GamePage } from './components/GamePage';
import { useRoute } from './route';
import './styles.css';

function App() {
  const game = useRoute();
  return game ? <GamePage key={game} id={game} /> : <Scoreboard />;
}

render(<App />, document.getElementById('app')!);
