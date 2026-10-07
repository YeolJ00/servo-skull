import { Armies } from './Armies.tsx';
import { ArmyEditor } from './ArmyEditor.tsx';
import { Game } from './Game.tsx';
import { GameSetup } from './GameSetup.tsx';
import { Home } from './Home.tsx';
import { Import } from './Import.tsx';
import { useRoute } from './router.ts';

export function App() {
  const route = useRoute();
  switch (route.screen) {
    case 'home':
      return <Home />;
    case 'import':
      return <Import />;
    case 'armies':
      return <Armies />;
    case 'army':
      return <ArmyEditor armyId={route.armyId} />;
    case 'setup':
      return <GameSetup />;
    case 'game':
      return <Game />;
  }
}
