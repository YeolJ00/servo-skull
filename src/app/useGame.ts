import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { clearGame, loadGame, saveGame } from '../data/gameStorage.ts';
import { apply, replay, replaySafe } from '../engine/reducer.ts';
import { EngineError, type EngineErrorCode, type GameEvent, type GameSetup, type GameState } from '../engine/types.ts';

interface Loaded {
  setup: GameSetup;
  events: GameEvent[];
}

export type GameHandle =
  | { status: 'loading' }
  | { status: 'none' }
  | {
      status: 'ready';
      state: GameState;
      events: GameEvent[];
      /** The last rejected event's error code, cleared by the next successful dispatch. */
      error: EngineErrorCode | null;
      dispatch: (event: GameEvent) => void;
      undo: () => void;
      end: () => Promise<void>;
    };

// The UI never computes rules. It dispatches events; the engine accepts or rejects them.
export function useGame(): GameHandle {
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [error, setError] = useState<EngineErrorCode | null>(null);

  useEffect(() => {
    let alive = true;
    void loadGame().then((g) => {
      if (!alive) return;
      if (!g) {
        setLoaded(null);
        return;
      }
      // A log that no longer replays (older engine, corrupted storage) is cut at the first bad event.
      const safe = replaySafe(g.setup, g.events);
      if (safe.dropped > 0) {
        console.warn(`Dropped ${safe.dropped} game events that no longer apply.`);
        void saveGame(g.setup, safe.events);
      }
      setLoaded({ setup: g.setup, events: safe.events });
    });
    return () => {
      alive = false;
    };
  }, []);

  const state = useMemo(() => (loaded ? replay(loaded.setup, loaded.events) : null), [loaded]);

  const commit = useCallback((setup: GameSetup, events: GameEvent[]) => {
    setLoaded({ setup, events });
    void saveGame(setup, events);
  }, []);

  const dispatch = useCallback(
    (event: GameEvent) => {
      if (!loaded || !state) return;
      try {
        apply(state, event);
      } catch (e) {
        if (e instanceof EngineError) {
          setError(e.code);
          return;
        }
        throw e;
      }
      setError(null);
      commit(loaded.setup, [...loaded.events, event]);
    },
    [loaded, state, commit],
  );

  const undo = useCallback(() => {
    if (!loaded || loaded.events.length === 0) return;
    setError(null);
    commit(loaded.setup, loaded.events.slice(0, -1));
  }, [loaded, commit]);

  const end = useCallback(async () => {
    await clearGame();
    setLoaded(null);
  }, []);

  if (loaded === undefined) return { status: 'loading' };
  if (loaded === null || !state) return { status: 'none' };
  return { status: 'ready', state, events: loaded.events, error, dispatch, undo, end };
}
