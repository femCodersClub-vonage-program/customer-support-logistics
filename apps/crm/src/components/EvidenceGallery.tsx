import { useTranslations } from 'next-intl';

import styles from './EvidenceGallery.module.css';

import type { EvidenceDownload } from '@csl/contracts';

interface EvidenceGalleryProps {
  evidence: EvidenceDownload[];
}

export function EvidenceGallery({ evidence }: EvidenceGalleryProps) {
  const t = useTranslations('incident.evidence');
  if (evidence.length === 0) return <p>{t('empty')}</p>;

  return (
    <section aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">{t('title')}</h2>
      <div className={styles.gallery}>
        {evidence.map((item) => (
          <a
            key={item.id}
            href={item.downloadUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.item}
          >
            {item.mimeType.startsWith('video/') ? (
              <video controls preload="metadata" src={item.downloadUrl} />
            ) : (
              <img src={item.downloadUrl} alt={t('imageAlt')} />
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
