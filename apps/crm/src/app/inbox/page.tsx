import { getTranslations } from 'next-intl/server';

import { InboxFilters } from '../../components/InboxFilters';
import { IncidentTable } from '../../components/IncidentTable';
import { Pagination } from '../../components/Pagination';
import { currentAgentId, serverApi } from '../../lib/api.server';
import { ASSIGNEE_ME, parseInboxQuery } from '../../lib/inbox-query';

import styles from './page.module.css';

import type { SearchParams } from '../../lib/inbox-query';

export default async function InboxPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const t = await getTranslations('inbox');
  const raw = await searchParams;
  const agentId = raw.agentId === ASSIGNEE_ME ? await currentAgentId() : '';
  const { query, params } = parseInboxQuery(raw, agentId);
  const { items, total, limit, offset, statusCounts } = await serverApi.listIncidents(query);

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>
      </header>
      <InboxFilters params={params} status={query.status ?? []} counts={statusCounts} />
      <IncidentTable items={items} params={params} sort={query.sort} order={query.order} />
      {total > 0 && <Pagination params={params} total={total} limit={limit} offset={offset} />}
    </>
  );
}
