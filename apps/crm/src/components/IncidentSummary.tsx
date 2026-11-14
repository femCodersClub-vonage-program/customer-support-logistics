import { useTranslations } from 'next-intl';

import { isDriverReplyReason, latestDriverReply } from '../lib/mediation';
import { shortId } from '../lib/short-id';

import styles from './IncidentSummary.module.css';
import { RelativeTime } from './RelativeTime';
import { StatusBadge } from './StatusBadge';

import type { IncidentDetail } from '@csl/contracts';

export function IncidentSummary({ incident }: Readonly<{ incident: IncidentDetail }>) {
  const t = useTranslations('mediation.summary');
  const tType = useTranslations('incident.type');
  const reply = latestDriverReply(incident.events);
  const replyText =
    reply !== undefined && isDriverReplyReason(reply.reason)
      ? t(`driverReply.${reply.reason}`)
      : reply?.reason;

  return (
    <section className={styles.card} aria-labelledby="incident-summary-title">
      <h2 id="incident-summary-title" className={styles.title}>
        {t('title')}
      </h2>
      <dl className={styles.list}>
        <dt>{t('type')}</dt>
        <dd>{tType(incident.type)}</dd>

        <dt>{t('status')}</dt>
        <dd>
          <StatusBadge status={incident.status} />
        </dd>

        <dt>{t('order')}</dt>
        <dd>{shortId(incident.order.id)}</dd>

        <dt>{t('address')}</dt>
        <dd>{incident.order.address}</dd>

        <dt>{t('customer')}</dt>
        <dd>
          {incident.customer.name} ·{' '}
          <a href={`tel:${incident.customer.phone}`}>{incident.customer.phone}</a>
        </dd>

        <dt>{t('driver')}</dt>
        <dd>{incident.driver?.name ?? t('noDriver')}</dd>

        <dt>{t('lastDriverReply')}</dt>
        <dd>
          {reply === undefined ? (
            t('noDriverReply')
          ) : (
            <>
              {replyText} · <RelativeTime value={reply.occurredAt} />
            </>
          )}
        </dd>
      </dl>
    </section>
  );
}
