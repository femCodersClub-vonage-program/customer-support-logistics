import { useTranslations } from 'next-intl';

export default function InboxPage() {
  const t = useTranslations('inbox');

  return <h1>{t('title')}</h1>;
}
