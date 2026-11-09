import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('notFound');

  return (
    <>
      <h1>{t('title')}</h1>
      <Link href="/inbox">{t('backToInbox')}</Link>
    </>
  );
}
