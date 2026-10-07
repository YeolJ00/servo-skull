import { useEffect, useState } from 'preact/hooks';
import { armyFromPreset, newArmy, parseArmyJson, summarizeArmy, type ArmyList, type Preset } from '../data/army.ts';
import { listArmies, saveArmy } from '../data/armyStorage.ts';
import orksPreset from '../data/presets/orks-example.json';
import marinesPreset from '../data/presets/ultramarines-example.json';
import { t } from '../i18n/index.ts';
import { BottomSheet } from '../ui/BottomSheet.tsx';
import { Button } from '../ui/Button.tsx';
import styles from './Armies.module.css';
import { navigate, routeHref } from './router.ts';
import { Shell } from './Shell.tsx';
import { useRules } from './useRules.ts';

const presets: Preset[] = [marinesPreset as Preset, orksPreset as Preset];

export function Armies() {
  const { status, rules } = useRules();
  const [armies, setArmies] = useState<ArmyList[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void listArmies().then(setArmies);
  }, []);

  const create = async () => {
    const army = newArmy(t.armies.untitled, rules.factions[0] ? [rules.factions[0].id] : []);
    await saveArmy(army);
    navigate({ screen: 'army', armyId: army.id });
  };

  const fromPreset = async (preset: Preset) => {
    const { army, missing } = armyFromPreset(preset, rules);
    if (missing.length === preset.units.length) {
      setMessage(t.armies.presetNeedsPack);
      setAdding(false);
      return;
    }
    await saveArmy(army);
    if (missing.length > 0) setMessage(t.armies.presetMissing(missing.join(', ')));
    navigate({ screen: 'army', armyId: army.id });
  };

  const onImport = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const army = parseArmyJson(await file.text());
      await saveArmy(army);
      navigate({ screen: 'army', armyId: army.id });
    } catch {
      setMessage(t.armies.importError);
      setAdding(false);
    }
  };

  const noRules = status === 'ready' && rules.datasheets.length === 0;

  return (
    <Shell
      fixed
      header={<h1>{t.nav.armies}</h1>}
      footer={
        <div class={styles.bar}>
          <Button href={routeHref({ screen: 'home' })} variant="ghost">
            {t.nav.back}
          </Button>
          <Button variant="primary" onClick={() => setAdding(true)} disabled={noRules}>
            {t.armies.add}
          </Button>
        </div>
      }
    >
      <div class={`scroll ${styles.page}`}>
        {noRules && (
          <section class={`plate ${styles.notice}`}>
            <p>{t.armies.noRules}</p>
            <Button href={routeHref({ screen: 'import' })} variant="secondary">
              {t.nav.import}
            </Button>
          </section>
        )}
        {message && <p class={styles.message}>{message}</p>}
        {armies.length === 0 && !noRules && <p class={styles.muted}>{t.armies.none}</p>}
        {armies.map((a) => {
          const s = summarizeArmy(a, rules);
          const factions = a.factionIds.map((id) => rules.factions.find((f) => f.id === id)?.name ?? id).join(', ');
          return (
            <a class={`plate plate-dim ${styles.army}`} href={routeHref({ screen: 'army', armyId: a.id })} key={a.id}>
              <span class={styles.armyName}>{a.name}</span>
              <span class={styles.muted}>{factions}</span>
              <span class={`${styles.muted} num`}>{t.armies.summary(a.units.length, s.models, s.points, a.pointsLimit)}</span>
            </a>
          );
        })}
      </div>

      <BottomSheet open={adding} title={t.armies.add} onClose={() => setAdding(false)}>
        <div class={styles.addSheet}>
          <Button variant="primary" block onClick={() => void create()}>
            {t.armies.new}
          </Button>
          <p class="kicker">{t.armies.start}</p>
          {presets.map((p) => (
            <Button key={p.name} variant="secondary" block onClick={() => void fromPreset(p)}>
              {t.armies.fromPreset(p.name)}
            </Button>
          ))}
          <label class={styles.fileButton}>
            <input type="file" accept=".json,application/json" onChange={(e) => void onImport(e)} />
            <span>{t.armies.importJson}</span>
          </label>
          <p class={styles.muted}>{t.armies.presetHint}</p>
        </div>
      </BottomSheet>
    </Shell>
  );
}
