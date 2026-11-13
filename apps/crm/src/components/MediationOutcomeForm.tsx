'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';

import { closeMediation } from '../app/incidents/[id]/mediation/actions';
import { IDLE_STATE, MEDIATION_NOTE_MAX_LENGTH, MEDIATION_OUTCOMES } from '../lib/mediation';

import { MediationError } from './MediationError';
import styles from './MediationPanel.module.css';

import type { Incident } from '@csl/shared-types';

export function MediationOutcomeForm({ incidentId }: Readonly<{ incidentId: Incident['id'] }>) {
  const t = useTranslations('mediation.outcome');
  const noteId = useId();
  const [state, action, pending] = useActionState(
    closeMediation.bind(null, incidentId),
    IDLE_STATE,
  );

  return (
    <section className={styles.card} aria-labelledby="mediation-outcome-title">
      <h2 id="mediation-outcome-title" className={styles.title}>
        {t('title')}
      </h2>

      <form action={action} className={styles.form}>
        <fieldset className={styles.fieldset}>
          <legend>{t('legend')}</legend>
          {MEDIATION_OUTCOMES.map((outcome) => (
            <label key={outcome} className={styles.option}>
              <input type="radio" name="outcome" value={outcome} required />
              {t(`options.${outcome}`)}
            </label>
          ))}
        </fieldset>

        <div className={styles.field}>
          <label htmlFor={noteId}>{t('note')}</label>
          <textarea
            id={noteId}
            name="note"
            rows={3}
            maxLength={MEDIATION_NOTE_MAX_LENGTH}
            aria-describedby={`${noteId}-hint`}
          />
          <small id={`${noteId}-hint`}>{t('noteHint', { max: MEDIATION_NOTE_MAX_LENGTH })}</small>
        </div>

        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? t('pending') : t('submit')}
        </button>
      </form>

      <MediationError error={state.error} />
    </section>
  );
}
