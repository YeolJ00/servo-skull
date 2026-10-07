import { useEffect, useState } from 'preact/hooks';
import { installPublished, loadPublishedIndex, type PublishedPack } from '../data/packPublish.ts';
import { listPacks, PackFormatError, removePack, savePack, validatePack, type PackMeta } from '../data/packStorage.ts';
import { t } from '../i18n/index.ts';
import { Button } from '../ui/Button.tsx';
import styles from './Import.module.css';
import { routeHref } from './router.ts';
import { Shell } from './Shell.tsx';
import { invalidateRules } from './useRules.ts';

// Rules packs are published with the site and installed into IndexedDB with one tap.
// A file import stays as a fallback. Nothing is fetched from third parties at runtime.
export function Import() {
  const [installed, setInstalled] = useState<PackMeta[]>([]);
  const [available, setAvailable] = useState<PublishedPack[] | null | undefined>(undefined);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showFile, setShowFile] = useState(false);

  const refresh = () => void listPacks().then(setInstalled);
  useEffect(() => {
    refresh();
    loadPublishedIndex()
      .then(setAvailable)
      .catch(() => setAvailable(null));
  }, []);

  const install = async (entry: PublishedPack) => {
    setBusyId(entry.id);
    setMessage(null);
    try {
      const meta = await installPublished(entry);
      invalidateRules();
      setMessage({ kind: 'ok', text: t.importScreen.imported(meta.name, meta.datasheets) });
      refresh();
    } catch {
      setMessage({ kind: 'error', text: t.importScreen.installFailed });
    } finally {
      setBusyId(null);
    }
  };

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setBusyId('file');
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
      setBusyId(null);
    }
  };

  const onRemove = async (meta: PackMeta) => {
    if (!window.confirm(t.importScreen.removeConfirm(meta.name))) return;
    await removePack(meta.id);
    invalidateRules();
    refresh();
  };

  const installedById = new Map(installed.map((m) => [m.id, m]));

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
        {message && <p class={message.kind === 'ok' ? styles.ok : styles.error}>{message.text}</p>}

        <section class={styles.list}>
          <p class="kicker">{t.importScreen.available}</p>
          {available === undefined && <p class={styles.muted}>{t.importScreen.checking}</p>}
          {available === null && <p class={styles.muted}>{t.importScreen.offline}</p>}
          {available?.length === 0 && <p class={styles.muted}>{t.importScreen.noneAvailable}</p>}
          {available?.map((p) => {
            const have = installedById.get(p.id);
            const current = have && have.lastUpdate === p.lastUpdate;
            return (
              <div class={`plate ${current ? 'plate-dim' : ''} ${styles.pack}`} key={p.id}>
                <div>
                  <p class={styles.packName}>{p.name}</p>
                  <p class={styles.muted}>{t.importScreen.packMeta(p.datasheets, p.lastUpdate)}</p>
                  <p class={styles.muted}>{t.importScreen.size(p.bytes)}</p>
                </div>
                {current ? (
                  <span class={styles.ok}>{t.importScreen.installed}</span>
                ) : (
                  <Button variant="primary" disabled={busyId !== null} onClick={() => void install(p)}>
                    {busyId === p.id ? t.importScreen.installing : have ? t.importScreen.update : t.importScreen.install}
                  </Button>
                )}
              </div>
            );
          })}
        </section>

        <section class={styles.list}>
          <p class="kicker">{t.importScreen.onDevice}</p>
          {installed.length === 0 && <p class={styles.muted}>{t.importScreen.none}</p>}
          {installed.map((p) => (
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
          <button type="button" class={styles.linkButton} onClick={() => setShowFile((v) => !v)} aria-expanded={showFile}>
            {t.importScreen.fileToggle}
          </button>
          {showFile && (
            <div class={`plate plate-dim ${styles.card}`}>
              <p>{t.importScreen.pickHelp}</p>
              <label class={styles.fileButton}>
                <input type="file" accept=".json,application/json" onChange={(e) => void onFile(e)} disabled={busyId !== null} />
                <span>{busyId === 'file' ? t.importScreen.importing : t.importScreen.pickButton}</span>
              </label>
              <p class={styles.muted}>{t.importScreen.howHelp}</p>
              <pre class={styles.code}>npm run pack -- --factions SM,ORK</pre>
            </div>
          )}
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
