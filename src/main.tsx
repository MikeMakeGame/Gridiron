import { render, type ComponentChildren } from 'preact';
import { useErrorBoundary } from 'preact/hooks';
import { Scoreboard } from './components/Scoreboard';
import { GamePage } from './components/GamePage';
import { go, setBoardWeek, useRoute } from './route';
import './styles.css';

/** A rendering crash shows a way out instead of a blank page. */
function Guard({ children }: { children: ComponentChildren }) {
  const [error, reset] = useErrorBoundary((e) => console.error('Gridiron: view crashed', e));
  if (!error) return <>{children}</>;
  return (
    <div class="app view-scoreboard">
      <p class="error">Something in ESPN's data broke this view.</p>
      <p class="empty">
        {/* This week, not a browsed one: a browsed week's own data may be what crashed. */}
        <button class="week-next" onClick={() => (reset(), setBoardWeek(undefined), go(null))}>
          Back to all games
        </button>
      </p>
    </div>
  );
}

function App() {
  const game = useRoute();
  return <Guard key={game ?? 'board'}>{game ? <GamePage key={game} id={game} /> : <Scoreboard />}</Guard>;
}

render(<App />, document.getElementById('app')!);
