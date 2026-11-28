import { useTranslations } from 'next-intl';

import styles from './MediationCall.module.css';

const BROWSERS = ['chrome', 'firefox', 'safari'] as const;

export function MicrophoneHelp() {
  const t = useTranslations('mediation.call.microphoneHelp');

  return (
    <section className={styles.help} aria-labelledby="microphone-help-title">
      <h3 id="microphone-help-title" className={styles.helpTitle}>
        {t('title')}
      </h3>
      <p>{t('intro')}</p>
      <ul className={styles.helpList}>
        {BROWSERS.map((browser) => (
          <li key={browser}>
            <strong>{t(`${browser}.name`)}</strong> {t(`${browser}.steps`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
