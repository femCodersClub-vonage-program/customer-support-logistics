import { Circle, CircleCheck, CircleDot, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { nextStepMessage, progressSteps } from './progress.ts';

import type { ProgressStep } from './progress.ts';
import type { IncidentDetail } from '@csl/contracts';

interface IncidentProgressProps {
  incident: Pick<IncidentDetail, 'status' | 'mediationInvite'>;
}

function StepIcon({ step }: { step: ProgressStep }) {
  const props = { size: 24, strokeWidth: 2, 'aria-hidden': true } as const;

  if (step.id === 'escalated') {
    return <TriangleAlert {...props} />;
  }

  if (step.state === 'done' || (step.state === 'current' && step.id === 'resolved')) {
    return <CircleCheck {...props} />;
  }

  return step.state === 'current' ? <CircleDot {...props} /> : <Circle {...props} />;
}

export function IncidentProgress({ incident }: IncidentProgressProps) {
  const t = useTranslations('incident');
  const steps = progressSteps(incident.status);
  const currentIndex = steps.findIndex((step) => step.state === 'current');
  const current = steps[currentIndex];

  return (
    <section className="incident-section" aria-labelledby="incident-progress-title">
      <h2 id="incident-progress-title" className="incident-section__title">
        {t('status')}
      </h2>
      {current && (
        <p className="incident-progress__summary">
          {t('progress.step', {
            current: currentIndex + 1,
            total: steps.length,
            label: t(`progress.steps.${current.id}`),
          })}
        </p>
      )}
      <ol className="incident-progress">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`incident-progress__step incident-progress__step--${step.state} incident-progress__step--${step.id}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <StepIcon step={step} />
            <span className="incident-progress__label">
              <span className="visually-hidden">{t(`progress.states.${step.state}`)}: </span>
              {t(`progress.steps.${step.id}`)}
            </span>
          </li>
        ))}
      </ol>
      <p className="incident-progress__next">{t(`progress.next.${nextStepMessage(incident)}`)}</p>
    </section>
  );
}
