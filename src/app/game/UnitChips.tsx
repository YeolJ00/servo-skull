import type { UnitState } from '../../engine/types.ts';
import { t } from '../../i18n/index.ts';
import styles from './game.module.css';

// Status chips for a unit. Every flag the engine tracks that matters at the table.
export function UnitChips({ unit }: { unit: UnitState }) {
  const chips: { text: string; tone: 'danger' | 'muted' | 'brass' }[] = [];
  if (unit.destroyed) chips.push({ text: t.play.chips.destroyed, tone: 'danger' });
  else {
    if (unit.battleShocked) chips.push({ text: t.play.chips.battleShocked, tone: 'danger' });
    if (unit.models < unit.startingStrength) chips.push({ text: t.play.chips.models(unit.models, unit.startingStrength), tone: 'muted' });
    if (unit.advanced) chips.push({ text: t.play.chips.advanced, tone: 'brass' });
    if (unit.fellBack) chips.push({ text: t.play.chips.fellBack, tone: 'brass' });
    if (unit.remainedStationary) chips.push({ text: t.play.chips.stationary, tone: 'muted' });
    if (unit.charged) chips.push({ text: t.play.chips.charged, tone: 'brass' });
    if (unit.fightsFirst && !unit.charged) chips.push({ text: t.play.chips.fightsFirst, tone: 'brass' });
    if (unit.selectedToShoot) chips.push({ text: t.play.chips.shot, tone: 'muted' });
    if (unit.selectedToFight) chips.push({ text: t.play.chips.fought, tone: 'muted' });
  }
  if (chips.length === 0) return null;
  return (
    <span class={styles.chips}>
      {chips.map((c) => (
        <span key={c.text} class={`${styles.chip} ${styles[c.tone]}`}>
          {c.text}
        </span>
      ))}
    </span>
  );
}
