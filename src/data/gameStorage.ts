import { del, get, set } from 'idb-keyval';
import type { GameEvent, GameSetup } from '../engine/types.ts';

// The current game is persisted after every event, so a refresh or a dead battery never loses it.
export interface SavedGame {
  schemaVersion: 1;
  setup: GameSetup;
  events: GameEvent[];
  savedAt: number;
}

const KEY = 'game:current';

export async function loadGame(): Promise<SavedGame | undefined> {
  try {
    const g = await get<SavedGame>(KEY);
    return g && g.schemaVersion === 1 ? g : undefined;
  } catch {
    return undefined;
  }
}

export async function saveGame(setup: GameSetup, events: GameEvent[]): Promise<void> {
  const g: SavedGame = { schemaVersion: 1, setup, events, savedAt: Date.now() };
  await set(KEY, g);
}

export async function clearGame(): Promise<void> {
  await del(KEY);
}
