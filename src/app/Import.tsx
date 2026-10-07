import { useEffect, useState } from 'preact/hooks';
import { listPacks, PackFormatError, removePack, savePack, validatePack, type PackMeta } from '../data/packStorage.ts';
import { t } from '../i18n/index.ts';
import { Button } from '../ui/Button.tsx';
import styles from './Import.module.css';
import { routeHref } from './router.ts';
import { Shell } from './Shell.tsx';
import { invalidateRules } from './useRules.ts';

// Rules packs are imported per device and stored in IndexedDB. Nothing is fetched at runtime.
export function Import() {
  const [packs, setPacks] = useState<PackMeta[]>([]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => void listPacks().then(setPacks);
  useEffect(refresh, []);

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const pack = validatePack(JSON.parse(await file.text()));
      const meta = await savePack(pack);
      invalidateRules();
      setMessage({ kind: 'ok', text: t.importScreen.imported(meta.name, meta.datasheets) });
      refresh();
    } catch (err) {
      const code = err instanceof PackFormatError ? err.message : 'json';
      setMessage({ kind: 'error', text: t.importScreen.errors[code as keyof typeof t.importScreen.errors] ?? t.importScreen.errors.json });
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (meta: PackMeta) => {
    if (!window.confirm(t.importScreen.removeConfirm(meta.name))) return;
    await removePack(meta.id);
    invalidateRules();
    refresh();
  };

  return (
    <Shell
      header={<h1>{t.nav.import}</h1>}
      footer={
        <Button href={routeHref({ screen: 'home' })} variant="ghost">
          {t.nav.back}
        </Button>
      }
    >
      <div class={styles.page}>
        <section class={`plate ${styles.card}`}>
          <p class="kicker">{t.importScreen.pickTitle}</p>
          <p>{t.importScreen.pickHelp}</p>
          <label class={styles.fileButton}>
            <input type="file" accept=".json,application/json" onChange={(e) => void onFile(e)} disabled={busy} />
            <span>{busy ? t.importScreen.importing : t.importScreen.pickButton}</span>
          </label>
          {message && <p class={message.kind === 'ok' ? styles.ok : styles.error}>{message.text}</p>}
        </section>

        <section class={styles.list}>
          <p class="kicker">{t.importScreen.installed}</p>
          {packs.length === 0 && <p class={styles.muted}>{t.importScreen.none}</p>}
          {packs.map((p) => (
            <div class={`plate plate-dim ${styles.pack}`} key={p.id}>
              <div>
                <p class={styles.packName}>{p.name}</p>
                <p class={styles.muted}>{t.importScreen.packMeta(p.datasheets, p.lastUpdate)}</p>
              </div>
              <Button variant="ghost" onClick={() => void onRemove(p)}>
                {t.importScreen.remove}
              </Button>
            </div>
          ))}
        </section>

        <section class={styles.howTo}>
          <p class="kicker">{t.importScreen.howTitle}</p>
          <p>{t.importScreen.howHelp}</p>
          <pre class={styles.code}>npm run pack -- --factions SM,ORK</pre>
          <p class={styles.muted}>
            <a href={t.app.wahapediaUrl} target="_blank" rel="noopener">
              {t.app.poweredBy}
            </a>
          </p>
        </section>
      </div>
    </Shell>
  );
}
