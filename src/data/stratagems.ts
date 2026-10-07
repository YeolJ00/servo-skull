// Which stratagems a player can use at the current step (15.01), from the pack's phase and turn fields.
// Pure. The engine enforces CP and the once-per-phase rule; this only filters the list.
import type { PhaseId } from '../engine/flow.ts';
import type { Stratagem } from './pack.ts';

export interface StratagemContext {
  /** The phase of the current step, or null at the start and end of a round. */
  phase: PhaseId | null;
  /** True when it is this player's own turn. */
  ownTurn: boolean;
  /** The player's army factions and detachment. */
  factionIds: string[];
  detachmentId: string | undefined;
}

const PHASE_WORDS: Record<PhaseId, string> = {
  command: 'command',
  movement: 'movement',
  shooting: 'shooting',
  charge: 'charge',
  fight: 'fight',
};

/** "Shooting or Fight phase" matches shooting and fight; "Any phase" matches all; "" matches all. */
export function phaseMatches(phaseText: string, phase: PhaseId | null): boolean {
  const text = phaseText.toLowerCase();
  if (!text || text.includes('any phase')) return true;
  if (!phase) return false;
  return text.includes(PHASE_WORDS[phase]);
}

/** "Your turn", "Opponent’s turn", "Either player’s turn" or blank. */
export function turnMatches(turnText: string, ownTurn: boolean): boolean {
  const text = turnText.toLowerCase();
  if (!text || text.includes('either')) return true;
  if (text.includes('opponent')) return !ownTurn;
  if (text.includes('your')) return ownTurn;
  return true;
}

/**
 * Core stratagems have no faction. The export also carries older and format-specific
 * faction-less sets; the 11th edition ones are typed "Core Stratagem".
 */
export function isCore(s: Stratagem): boolean {
  return s.factionId === '' && /^core stratagem/i.test(s.type);
}

export function belongsTo(s: Stratagem, ctx: StratagemContext): boolean {
  if (isCore(s)) return true;
  if (!ctx.factionIds.includes(s.factionId)) return false;
  // Detachment stratagems only for the chosen detachment; faction-wide ones always.
  return !s.detachmentId || s.detachmentId === ctx.detachmentId;
}

export function usableStratagems(all: Stratagem[], ctx: StratagemContext): Stratagem[] {
  const seen = new Set<string>();
  return all
    .filter((s) => belongsTo(s, ctx) && phaseMatches(s.phase, ctx.phase) && turnMatches(s.turn, ctx.ownTurn))
    .filter((s) => {
      // The export repeats some core stratagems; keep one per name.
      const key = `${s.factionId}|${s.detachmentId}|${s.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (isCore(a) === isCore(b) ? a.name.localeCompare(b.name) : isCore(a) ? 1 : -1));
}

/** Plain text from the export's HTML description. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cpCost(s: Stratagem): number {
  const n = parseInt(s.cpCost, 10);
  return Number.isFinite(n) ? n : 0;
}
