import { useEffect, useState } from 'preact/hooks';
import { loadGame } from '../data/gameStorage.ts';
import { t } from '../i18n/index.ts';
import { BottomSheet } from '../ui/BottomSheet.tsx';
import { Button } from '../ui/Button.tsx';
import { IconSettings } from '../ui/icons.tsx';
import { SkullIcon } from '../ui/SkullIcon.tsx';
import styles from './Home.module.css';
import { routeHref } from './router.ts';
import { Shell } from './Shell.tsx';
import { useTheme, type Theme } from './theme.ts';

const themes: Theme[] = ['system', 'dark', 'light'];
const themeLabel: Record<Theme, string> = {
  system: t.home.themeSystem,
  dark: t.home.themeDark,
  light: t.home.themeLight,
};

export function Home() {
  const [theme, setTheme] = useTheme();
  const [hasGame, setHasGame] = useState(false);
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    void loadGame().then((g) => setHasGame(!!g));
  }, []);
  return (
    <Shell fixed>
      <div class={styles.page}>
        <section class={styles.hero}>
          <button type="button" class={`icon-button ${styles.settingsBtn}`} onClick={() => setSettings(true)} aria-label={t.home.settings}>
            <IconSettings />
          </button>
          <SkullIcon size={96} class={styles.skull} title={t.app.name} />
          <h1 class={styles.title}>{t.app.name}</h1>
          <p class={styles.tagline}>{t.app.tagline}</p>
          <div class={styles.rule} aria-hidden="true">
            <span />
            <i />
            <span />
          </div>
        </section>

        <div class={styles.menu}>
          {hasGame && (
            <Button href={routeHref({ screen: 'game' })} variant="primary" block>
              {t.home.continueGame}
            </Button>
          )}
          <Button href={routeHref({ screen: 'setup' })} variant={hasGame ? 'secondary' : 'primary'} block>
            {t.home.newGame}
          </Button>
          <Button href={routeHref({ screen: 'armies' })} variant="secondary" block>
            {t.home.armies}
          </Button>
          <Button href={routeHref({ screen: 'import' })} variant="secondary" block>
            {t.home.import}
          </Button>
        </div>

        <p class={styles.credit}>
          <a href={t.app.wahapediaUrl} target="_blank" rel="noopener">
            {t.app.poweredBy}
          </a>
        </p>
      </div>

      <BottomSheet open={settings} title={t.home.settings} onClose={() => setSettings(false)}>
        <div class={styles.settings}>
          <p class="kicker">{t.home.theme}</p>
          <div class={styles.segmented} role="group">
            {themes.map((th) => (
              <button
                key={th}
                type="button"
                class={th === theme ? styles.segmentOn : styles.segment}
                aria-pressed={th === theme}
                onClick={() => setTheme(th)}
              >
                {themeLabel[th]}
              </button>
            ))}
          </div>
          <p class={styles.hint}>{t.home.aboutHint}</p>
        </div>
      </BottomSheet>
    </Shell>
  );
}
