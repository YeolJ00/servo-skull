import { useMemo } from 'preact/hooks';
import { cryptoRng } from '../dice/rng.ts';
import { roll2D6, rollD6 } from '../dice/roll.ts';
import { t } from '../i18n/index.ts';
import styles from './DiceRoll.module.css';

interface Props {
  kind: 'd6' | '2d6';
  /** Called once with the result, whether it was rolled here or entered from real dice. */
  onResult: (total: number) => void;
  disabled?: boolean;
}

// Every roll has two input modes: digital (crypto RNG) or physical (tap the number you rolled).
export function DiceRoll({ kind, onResult, disabled }: Props) {
  const rng = useMemo(() => cryptoRng(), []);
  const faces = kind === 'd6' ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const roll = () => onResult(kind === 'd6' ? rollD6(rng) : roll2D6(rng).total);
  return (
    <div class={styles.wrap}>
      <button type="button" class={styles.roll} onClick={roll} disabled={disabled}>
        {kind === 'd6' ? t.dice.rollD6 : t.dice.roll2D6}
      </button>
      <p class={styles.or}>{t.dice.orEnter}</p>
      <div class={styles.faces} role="group" aria-label={t.dice.orEnter}>
        {faces.map((n) => (
          <button key={n} type="button" class={`${styles.face} num`} onClick={() => onResult(n)} disabled={disabled}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
