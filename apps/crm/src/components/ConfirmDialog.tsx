'use client';

import { useEffect, useId, useRef } from 'react';

import styles from './MediationCall.module.css';

import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])';

// A modal confirmation. Focus goes to "Cancel" when it opens, because the action is destructive,
// stays inside while it is open, and goes back to what had it before when it closes.
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel,
  pending,
  onConfirm,
  onCancel,
}: Readonly<ConfirmDialogProps>) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement;

    cancelRef.current?.focus();

    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !pending) {
      event.stopPropagation();
      onCancel();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={styles.dialog}
        onKeyDown={onKeyDown}
      >
        <h3 id={titleId} className={styles.dialogTitle}>
          {title}
        </h3>
        <div id={descriptionId} className={styles.dialogBody}>
          {children}
        </div>
        <div className={styles.dialogActions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.secondaryButton}
            disabled={pending}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
