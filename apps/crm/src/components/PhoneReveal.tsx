'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import styles from './PhoneReveal.module.css';

interface PhoneRevealProps {
  phone: string;
}

export function PhoneReveal({ phone }: PhoneRevealProps) {
  const t = useTranslations('incident.phone');
  const [visible, setVisible] = useState(false);

  const maskedPhone = `****${phone.slice(-4)}`;

  return (
    <p className={styles.row}>
      <span className={styles.phone}>{visible ? phone : maskedPhone}</span>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible((current) => !current)}
        aria-pressed={visible}
      >
        {visible ? t('hide') : t('show')}
      </button>
    </p>
  );
}
