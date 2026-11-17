'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PhoneRevealProps {
  phone: string;
}

export function PhoneReveal({ phone }: PhoneRevealProps) {
  const t = useTranslations('incident.phone');
  const [visible, setVisible] = useState(false);

  const maskedPhone = `****${phone.slice(-4)}`;

  return (
    <p>
      <span>{visible ? phone : maskedPhone}</span>{' '}
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-pressed={visible}
      >
        {visible ? t('hide') : t('show')}
      </button>
    </p>
  );
}
