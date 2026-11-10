import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { shortId } from '../lib/short-id';

import styles from './IncidentTable.module.css';
import { RelativeTime } from './RelativeTime';
import { StatusBadge } from './StatusBadge';

import type { IncidentListItem } from '@csl/contracts';

const COLUMNS = [
  'reference',
  'type',
  'order',
  'customer',
  'status',
  'agent',
  'created',
  'updated',
] as const;

export function IncidentTable({ items }: Readonly<{ items: IncidentListItem[] }>) {
  const t = useTranslations('inbox');
  const tType = useTranslations('incident.type');

  if (items.length === 0) {
    return <p className={styles.empty}>{t('empty')}</p>;
  }

  return (
    <div className={styles.scroll}>
      <table className={styles.table} aria-label={t('title')}>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col">
                {t(`columns.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((incident) => (
            <tr key={incident.id} className={styles.row}>
              <td>
                <Link href={`/incidents/${incident.id}`} className={styles.link}>
                  {shortId(incident.id)}
                </Link>
              </td>
              <td>{tType(incident.type)}</td>
              <td>{shortId(incident.orderId)}</td>
              <td>{incident.customer.name}</td>
              <td>
                <StatusBadge status={incident.status} />
              </td>
              <td>{incident.agentId ? shortId(incident.agentId) : t('unassigned')}</td>
              <td>
                <RelativeTime value={incident.createdAt} />
              </td>
              <td>
                <RelativeTime value={incident.updatedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}