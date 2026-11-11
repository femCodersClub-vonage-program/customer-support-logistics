'use client';

import { useTranslations } from 'next-intl';

export default function InboxError({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const t = useTranslations('inbox.error');

  return (
    <>
      <p role="alert">{t('message')}</p>
      <button type="button" onClick={reset}>
        {t('retry')}
      </button>
    </>
  );
}
