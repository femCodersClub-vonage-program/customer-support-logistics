import { getTranslations } from 'next-intl/server';

import { InboxFilters } from '../../components/InboxFilters';
import { IncidentTable } from '../../components/IncidentTable';
import { Pagination } from '../../components/Pagination';
import { CURRENT_AGENT_ID, serverApi } from '../../lib/api.server';
import { parseInboxQuery } from '../../lib/inbox-query';

import type { SearchParams } from '../../lib/inbox-query';

export default async function InboxPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const t = await getTranslations('inbox');
  const { query, params } = parseInboxQuery(await searchParams, CURRENT_AGENT_ID);
  const { items, total, limit, offset, statusCounts } = await serverApi.listIncidents(query);

  return (
    <>
      <h1>{t('title')}</h1>
      <InboxFilters params={params} status={query.status ?? []} counts={statusCounts} />
      <IncidentTable items={items} params={params} sort={query.sort} order={query.order} />
      {total > 0 && <Pagination params={params} total={total} limit={limit} offset={offset} />}
    </>
  );
}
