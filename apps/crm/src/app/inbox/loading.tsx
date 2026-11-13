import { useTranslations } from 'next-intl';

export default function InboxLoading() {
  const t = useTranslations('inbox');

  return (
    <>
      <h1>{t('title')}</h1>
      <p role="status">{t('loading')}</p>
    </>
  );
}
