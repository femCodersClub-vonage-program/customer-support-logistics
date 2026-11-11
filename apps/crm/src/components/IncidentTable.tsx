import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { sortHref } from '../lib/inbox-query';
import { shortId } from '../lib/short-id';

import styles from './IncidentTable.module.css';
import { RelativeTime } from './RelativeTime';
import { StatusBadge } from './StatusBadge';

import type { SearchParams } from '../lib/inbox-query';
import type { IncidentListItem, ListIncidentsQuery } from '@csl/contracts';

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

const SORT_FIELDS: Partial<Record<(typeof COLUMNS)[number], ListIncidentsQuery['sort']>> = {
  created: 'createdAt',
  updated: 'updatedAt',
};

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

export function IncidentTable({
  items,
  params,
  sort,
  order,
}: Readonly<{
  items: IncidentListItem[];
  params: SearchParams;
  sort: ListIncidentsQuery['sort'];
  order: ListIncidentsQuery['order'];
}>) {
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
            {COLUMNS.map((column) => {
              const field = SORT_FIELDS[column];
              const isActive = field === sort;

              return (
                <th key={column} scope="col" aria-sort={isActive ? ARIA_SORT[order] : undefined}>
                  {field === undefined ? (
                    t(`columns.${column}`)
                  ) : (
                    <Link
                      href={sortHref(params, field, isActive && order === 'asc' ? 'desc' : 'asc')}
                      className={styles.sortLink}
                    >
                      {t(`columns.${column}`)}
                    </Link>
                  )}
                </th>
              );
            })}
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
