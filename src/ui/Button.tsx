import type { ComponentChildren, MouseEventHandler } from 'preact';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props {
  variant?: Variant;
  /** Render as a link. Use for navigation so the browser's back button works. */
  href?: string;
  disabled?: boolean;
  block?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  children: ComponentChildren;
  ariaLabel?: string;
}

export function Button({ variant = 'secondary', href, disabled, block, onClick, children, ariaLabel }: Props) {
  const cls = [styles.button, styles[variant], block ? styles.block : ''].join(' ');
  if (href !== undefined && !disabled) {
    return (
      <a class={cls} href={href} onClick={onClick} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <button class={cls} type="button" disabled={disabled} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
