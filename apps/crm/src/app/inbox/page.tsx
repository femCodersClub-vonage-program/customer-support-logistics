import { getTranslations } from 'next-intl/server';

import { IncidentTable } from '../../components/IncidentTable';
import { InboxFilters } from '../../components/InboxFilters';
import { CURRENT_AGENT_ID, serverApi } from '../../lib/api.server';
import { parseInboxQuery } from '../../lib/inbox-query';

import type { SearchParams } from '../../lib/inbox-query';

export default async function InboxPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const t = await getTranslations('inbox');
  const params = await searchParams;
  const query = parseInboxQuery(params, CURRENT_AGENT_ID);
  const { items } = await serverApi.listIncidents(query);

  return (
    <>
      <h1>{t('title')}</h1>
      <InboxFilters params={params} status={query.status ?? []} />
      <IncidentTable items={items} />
    </>
  );
}