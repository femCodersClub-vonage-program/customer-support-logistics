import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { api } from '../api.ts';

import type { Evidence } from '@csl/shared-types';

const EVIDENCE_STALE_TIME_MS = 4 * 60_000;

interface IncidentEvidenceProps {
  incidentId: string;
  evidence: readonly Evidence[];
}

export function IncidentEvidence({ incidentId, evidence }: IncidentEvidenceProps) {
  const t = useTranslations('incident.evidence');
  const readyCount = evidence.filter((item) => item.status === 'ready').length;
  const pendingCount = evidence.length - readyCount;

  const { data = [], isError } = useQuery({
    queryKey: ['incidents', incidentId, 'evidence'],
    queryFn: ({ signal }) => api.listEvidence(incidentId, { signal }),
    enabled: readyCount > 0,
    staleTime: EVIDENCE_STALE_TIME_MS,
  });

  if (evidence.length === 0) {
    return null;
  }

  return (
    <section className="incident-section" aria-labelledby="incident-evidence-title">
      <h2 id="incident-evidence-title" className="incident-section__title">
        {t('title')}
      </h2>
      {isError && <p role="alert">{t('error')}</p>}
      {data.length > 0 && (
        <ul className="incident-evidence">
          {data.map((item, index) => (
            <li key={item.id} className="incident-evidence__item">
              {item.mimeType.startsWith('video/') ? (
                <video
                  controls
                  preload="metadata"
                  src={item.downloadUrl}
                  aria-label={t('video', { number: index + 1 })}
                />
              ) : (
                <a href={item.downloadUrl} target="_blank" rel="noreferrer">
                  <img src={item.downloadUrl} alt={t('photo', { number: index + 1 })} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {pendingCount > 0 && <p>{t('processing', { count: pendingCount })}</p>}
    </section>
  );
}
