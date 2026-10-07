import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { t } from '../i18n/index.ts';
import styles from './BottomSheet.module.css';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

// Details open in a bottom sheet, never a new page. The caller keeps only one open at a time.
export function BottomSheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  // Portalled to the body: plates use `isolation: isolate`, which would otherwise trap the
  // sheet in a stacking context below the sticky footer.
  return createPortal(
    <div class={styles.backdrop} onClick={onClose}>
      <section
        class={`plate ${styles.sheet}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header class={styles.header}>
          <h2 class={styles.title}>{title}</h2>
          <button type="button" class={styles.close} onClick={onClose} aria-label={t.sheet.close}>
            ×
          </button>
        </header>
        <div class={styles.body}>{children}</div>
      </section>
    </div>,
    document.body,
  );
}
