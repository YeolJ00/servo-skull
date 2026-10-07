import { useState } from 'preact/hooks';
import { t } from '../i18n/index.ts';
import styles from './FaceCounter.module.css';

interface Props {
  /** How many dice were rolled. The entered faces must add up to this. */
  count: number;
  /** 6 for D6 pools, 3 for D3 pools. */
  faces?: 6 | 3;
  confirmLabel: string;
  onConfirm: (dice: number[]) => void;
}

// Physical dice entry for a pool: tap each face as many times as it came up. Order never matters.
export function FaceCounter({ count, faces = 6, confirmLabel, onConfirm }: Props) {
  const [counts, setCounts] = useState<number[]>(() => Array.from({ length: faces }, () => 0));
  const entered = counts.reduce((a, b) => a + b, 0);
  const complete = entered === count;
  const bump = (i: number, delta: number) =>
    setCounts((c) => c.map((n, j) => (j === i ? Math.max(0, Math.min(count, n + delta)) : n)));
  const dice = counts.flatMap((n, i) => Array.from({ length: n }, () => i + 1));
  return (
    <div class={styles.wrap}>
      <p class={`${styles.status} num`}>{t.dice.entered(entered, count)}</p>
      <div class={styles.grid}>
        {counts.map((n, i) => (
          <div class={styles.face} key={i}>
            <span class={`${styles.pip} num`}>{i + 1}</span>
            <button type="button" class={styles.btn} onClick={() => bump(i, -1)} disabled={n === 0} aria-label={`${t.counter.decrease} ${i + 1}`}>
              −
            </button>
            <span class={`${styles.count} num`}>{n}</span>
            <button type="button" class={styles.btn} onClick={() => bump(i, 1)} disabled={complete} aria-label={`${t.counter.increase} ${i + 1}`}>
              +
            </button>
          </div>
        ))}
      </div>
      <button type="button" class={styles.confirm} disabled={!complete} onClick={() => onConfirm(dice)}>
        {confirmLabel}
      </button>
    </div>
  );
}
