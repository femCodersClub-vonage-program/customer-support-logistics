import { UNASSIGNED_AGENT } from '@csl/contracts';
import { INCIDENT_STATUSES, INCIDENT_TYPES } from '@csl/shared-types';
import { useTranslations } from 'next-intl';

import { ASSIGNEE_ME, firstParam } from '../lib/inbox-query';

import styles from './InboxFilters.module.css';

import type { SearchParams } from '../lib/inbox-query';
import type { IncidentStatus } from '@csl/shared-types';

export function InboxFilters({
  params,
  status,
}: Readonly<{ params: SearchParams; status: readonly IncidentStatus[] }>) {
  const t = useTranslations('inbox');
  const tStatus = useTranslations('incident.status');
  const tType = useTranslations('incident.type');
  const sort = firstParam(params.sort);

  return (
    <form method="get" action="/inbox" className={styles.form}>
      <div className={styles.group}>
        <span>{t('filters.status')}</span>
        <details className={styles.dropdown}>
          <summary className={styles.summary}>
            {status.length > 0
              ? status.map((value) => tStatus(value)).join(', ')
              : t('filters.any')}
          </summary>
          <div className={styles.panel}>
            {INCIDENT_STATUSES.map((value) => (
              <label key={value} className={styles.option}>
                <input
                  type="checkbox"
                  name="status"
                  value={value}
                  defaultChecked={status.includes(value)}
                />
                {tStatus(value)}
              </label>
            ))}
          </div>
        </details>
      </div>

      <label className={styles.field}>
        {t('filters.type')}
        <select name="type" defaultValue={firstParam(params.type) ?? ''}>
          <option value="">{t('filters.any')}</option>
          {INCIDENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {tType(value)}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        {t('filters.assignee')}
        <select name="agentId" defaultValue={firstParam(params.agentId) ?? ''}>
          <option value="">{t('filters.any')}</option>
          <option value={ASSIGNEE_ME}>{t('filters.assigneeMe')}</option>
          <option value={UNASSIGNED_AGENT}>{t('unassigned')}</option>
        </select>
      </label>

      <label className={styles.field}>
        {t('filters.from')}
        <input type="date" name="createdFrom" defaultValue={firstParam(params.createdFrom)} />
      </label>

      <label className={styles.field}>
        {t('filters.to')}
        <input type="date" name="createdTo" defaultValue={firstParam(params.createdTo)} />
      </label>

      <label className={styles.field}>
        {t('filters.search')}
        <input
          type="search"
          name="q"
          placeholder={t('filters.searchHint')}
          defaultValue={firstParam(params.q)}
        />
      </label>

      {sort !== undefined && <input type="hidden" name="sort" value={sort} />}

      <button type="submit" className={styles.button}>
        {t('filters.apply')}
      </button>
    </form>
  );
}
