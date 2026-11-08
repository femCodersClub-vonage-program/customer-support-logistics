import { useTranslations } from 'use-intl';

export function LoginPage() {
  const t = useTranslations('login');

  return (
    <main>
      <h1>{t('title')}</h1>
    </main>
  );
}
