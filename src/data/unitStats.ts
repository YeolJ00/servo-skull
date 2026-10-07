// Per-model stats for a unit of a given size, derived from a datasheet's composition and profiles.
// Pure. Used to seed wounds in the engine and to build attack targets.
import { parseTarget, type Datasheet, type ModelProfile } from './pack.ts';

export interface ModelStats {
  name: string;
  w: number;
  t: number;
  sv: number;
  invSv: number | null;
  character: boolean;
}

function statsOf(profile: ModelProfile | undefined, character: boolean): ModelStats {
  return {
    name: profile?.name ?? '',
    w: parseTarget(profile?.w ?? '') ?? (Number(profile?.w) || 1),
    t: Number(profile?.t) || 4,
    sv: parseTarget(profile?.sv ?? '') ?? 7,
    invSv: parseTarget(profile?.invSv ?? '') ?? null,
    character,
  };
}

/**
 * Expands a datasheet to `count` models. Each composition line ("1-2 Nob models") is matched to the
 * profile whose name it mentions; minimums are filled first and extra models go to the widest line.
 * Units with one profile (or no match) use that profile for every model.
 */
export function expandModels(sheet: Datasheet, count: number): ModelStats[] {
  const character = sheet.keywords.some((k) => k.toLowerCase() === 'character');
  if (sheet.models.length <= 1 || sheet.composition.length === 0) {
    return Array.from({ length: count }, () => statsOf(sheet.models[0], character));
  }
  const lines = sheet.composition.map((line) => {
    const text = line.description.toLowerCase();
    const profile =
      sheet.models.find((m) => m.name && text.includes(m.name.toLowerCase())) ??
      sheet.models.find((m) => m.name && text.includes(m.name.toLowerCase().replace(/s$/, '')));
    return { profile, min: line.min, max: line.max, n: 0 };
  });
  let remaining = count;
  for (const l of lines) {
    l.n = Math.min(l.min, remaining);
    remaining -= l.n;
  }
  while (remaining > 0) {
    const open = lines.filter((l) => l.n < l.max);
    const pick = open.sort((a, b) => b.max - b.n - (a.max - a.n))[0] ?? lines[lines.length - 1];
    if (!pick) break;
    pick.n++;
    remaining--;
  }
  // Leaders of the squad (the first line, e.g. Sergeant or Nob) come first so casualties from the end hit the rank and file.
  const out: ModelStats[] = [];
  for (const l of lines) for (let i = 0; i < l.n; i++) out.push(statsOf(l.profile ?? sheet.models[0], character));
  return out;
}
