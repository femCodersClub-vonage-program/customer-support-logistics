import { useTranslations } from 'next-intl';

import { PARTICIPANT_ROLES } from '../lib/call/participants';

import styles from './MediationCall.module.css';

import type { ParticipantRole, ParticipantsState } from '../lib/call/participants';

export type RemovableRole = Exclude<ParticipantRole, 'agent'>;

interface CallParticipantsPanelProps {
  state: ParticipantsState;
  onRemove: (role: RemovableRole) => void;
  customerName: string;
  driverName: string | null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function CallParticipantsPanel({
  state,
  onRemove,
  customerName,
  driverName,
}: Readonly<CallParticipantsPanelProps>) {
  const t = useTranslations('mediation.call');
  const { announcement } = state;
  const names: Record<ParticipantRole, string> = {
    agent: t('participants.agentName'),
    customer: customerName,
    driver: driverName ?? t('participants.noDriver'),
  };

  return (
    <section className={styles.participants} aria-label={t('participants.title')}>
      {PARTICIPANT_ROLES.map((role) => {
        const { state: participantState, channel } = state.participants[role];

        return (
          <article
            key={role}
            className={styles.participantCard}
            data-role={role}
            data-state={participantState}
          >
            <div className={styles.participantHeader}>
              <span className={styles.avatar} data-role={role} aria-hidden="true">
                {role === 'agent' ? 'A' : initialsOf(names[role])}
              </span>
              <div className={styles.participantInfo}>
                <p className={styles.participantName}>{names[role]}</p>
                <p className={styles.participantRole}>
                  {t(`participants.roles.${role}`)} · {t(`participants.channels.${channel}`)}
                </p>
              </div>
            </div>
            <p className={styles.participantState} data-state={participantState}>
              <span className={styles.dot} aria-hidden="true" />
              {t(`participants.states.${participantState}`)}
            </p>
            {role !== 'agent' &&
              (participantState === 'connected' || participantState === 'ringing') && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => onRemove(role)}
                >
                  {t('controls.remove', { name: names[role] })}
                </button>
              )}
          </article>
        );
      })}

      <p aria-live="polite" className={styles.visuallyHidden}>
        {announcement === null
          ? ''
          : t(`participants.announcements.${announcement.kind}`, {
              name: names[announcement.role],
            })}
      </p>
    </section>
  );
}
