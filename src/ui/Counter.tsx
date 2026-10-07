import { t } from '../i18n/index.ts';
import styles from './Counter.module.css';

interface Props {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}

// A labelled number with minus and plus buttons, each a full touch target.
export function Counter({ label, value, min = 0, max, onChange }: Props) {
  const canDec = value > min;
  const canInc = max === undefined || value < max;
  return (
    <div class={styles.counter}>
      <span class={styles.label}>{label}</span>
      <div class={styles.controls}>
        <button
          type="button"
          class={styles.button}
          disabled={!canDec}
          aria-label={`${t.counter.decrease} ${label}`}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <span class={`${styles.value} num`} aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          class={styles.button}
          disabled={!canInc}
          aria-label={`${t.counter.increase} ${label}`}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
