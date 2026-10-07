import type { ComponentChildren } from 'preact';
import styles from './Shell.module.css';

interface Props {
  /** Header content. During a game it is tinted with the active player's color. Omit for a hero screen. */
  header?: ComponentChildren;
  /** CSS color used to tint the header and its top bar. */
  tint?: string | undefined;
  /** Bottom bar content, in the thumb zone. The primary action goes last (right). */
  footer?: ComponentChildren;
  /**
   * Two panes on a landscape tablet (≥ 900px): the first child goes left, the rest right.
   * Only the Game screen uses this; other screens stay single-column.
   */
  panes?: boolean;
  /**
   * The main area fills the screen and never scrolls the page; children scroll inside themselves.
   * Used by the Game screen so the current step and its checklist always stay in view.
   */
  fixed?: boolean;
  children: ComponentChildren;
}

// App shell: header, scrolling main area, bottom bar. Safe-area padded.
export function Shell({ header, tint, footer, panes, fixed, children }: Props) {
  const mainClass = [fixed ? styles.mainFixed : styles.main, panes ? styles.mainPanes : ''].join(' ');
  return (
    <div class={fixed ? styles.shellFixed : styles.shell}>
      {header ? (
        <header class={styles.header} style={tint ? { '--tint': tint } : undefined}>
          {header}
        </header>
      ) : (
        <div class={styles.topPad} />
      )}
      <main class={mainClass}>{children}</main>
      {footer && <footer class={styles.footer}>{footer}</footer>}
    </div>
  );
}
