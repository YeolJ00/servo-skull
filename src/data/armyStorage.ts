import { get, set } from 'idb-keyval';
import type { ArmyList } from './army.ts';

const KEY = 'armies';

export async function listArmies(): Promise<ArmyList[]> {
  try {
    const all = (await get<ArmyList[]>(KEY)) ?? [];
    return [...all].sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function getArmy(id: string): Promise<ArmyList | undefined> {
  return (await listArmies()).find((a) => a.id === id);
}

export async function saveArmy(army: ArmyList): Promise<void> {
  const all = (await listArmies()).filter((a) => a.id !== army.id);
  all.push({ ...army, updatedAt: Date.now() });
  await set(KEY, all);
}

export async function removeArmy(id: string): Promise<void> {
  const all = (await listArmies()).filter((a) => a.id !== id);
  await set(KEY, all);
}
