import { t } from '../i18n/index.ts';
import { Game } from './Game.tsx';
import { GameSetup } from './GameSetup.tsx';
import { Home } from './Home.tsx';
import { Placeholder } from './Placeholder.tsx';
import { useRoute } from './router.ts';

export function App() {
  const route = useRoute();
  switch (route.screen) {
    case 'home':
      return <Home />;
    case 'import':
      return <Placeholder title={t.nav.import} body={t.placeholder.import} />;
    case 'armies':
    case 'army':
      return <Placeholder title={t.nav.armies} body={t.placeholder.armies} />;
    case 'setup':
      return <GameSetup />;
    case 'game':
      return <Game />;
  }
}
