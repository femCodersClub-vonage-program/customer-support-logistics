import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import {
  addFiles,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_IMAGE_BYTES,
  EVIDENCE_MAX_VIDEO_BYTES,
} from './evidence-files.ts';
import './evidence.css';

import type { EvidenceRejection } from './evidence-files.ts';
import type { ChangeEvent } from 'react';

const ACCEPT = 'image/*,video/*';
const CAMERA = 'environment';
const MB = 1024 * 1024;

const LIMITS = {
  maxFiles: EVIDENCE_MAX_FILES,
  imageMb: EVIDENCE_MAX_IMAGE_BYTES / MB,
  videoMb: EVIDENCE_MAX_VIDEO_BYTES / MB,
};

const keys = new WeakMap<File, string>();
let nextKey = 0;

function keyOf(file: File): string {
  let key = keys.get(file);

  if (key === undefined) {
    key = String(nextKey++);
    keys.set(file, key);
  }

  return key;
}

function EvidencePreview({ file }: Readonly<{ file: File }>) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);

    setUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  if (url === null) {
    return <span aria-hidden="true" className="evidence-preview" />;
  }

  return file.type.startsWith('video/') ? (
    <video
      className="evidence-preview"
      src={url}
      muted
      controls
      preload="metadata"
      aria-label={file.name}
    />
  ) : (
    <img className="evidence-preview" src={url} alt="" />
  );
}

export function EvidencePicker({
  files,
  onChange,
  suggestPhoto,
  disabled = false,
}: Readonly<{
  files: readonly File[];
  onChange: (files: File[]) => void;
  suggestPhoto: boolean;
  disabled?: boolean;
}>) {
  const t = useTranslations('report.evidence');
  const id = useId();
  const hintId = `${id}-hint`;
  const [rejected, setRejected] = useState<EvidenceRejection[]>([]);

  const needsPhoto = suggestPhoto && !files.some((file) => file.type.startsWith('image/'));

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);

    event.target.value = '';

    if (incoming.length === 0) {
      return;
    }

    const result = addFiles(files, incoming);

    onChange(result.files);
    setRejected(result.rejected);
  }

  function remove(file: File) {
    onChange(files.filter((candidate) => candidate !== file));
    setRejected([]);
  }

  return (
    <fieldset className="report-form__group" disabled={disabled}>
      <legend className="report-form__legend">{t('title')}</legend>

      <div className="evidence__actions">
        <label className="evidence-button">
          <input
            className="evidence-button__input"
            type="file"
            accept={ACCEPT}
            capture={CAMERA}
            aria-describedby={hintId}
            onChange={handleChange}
          />
          <span className="pwa-button">{t('camera')}</span>
        </label>
        <label className="evidence-button">
          <input
            className="evidence-button__input"
            type="file"
            accept={ACCEPT}
            multiple
            aria-describedby={hintId}
            onChange={handleChange}
          />
          <span className="pwa-button pwa-button--secondary">{t('gallery')}</span>
        </label>
      </div>

      <p id={hintId} className="report-form__hint">
        {t('hint', LIMITS)}
      </p>

      {needsPhoto && <p className="report-form__hint">{t('suggestPhoto')}</p>}

      {rejected.length > 0 && (
        <ul role="alert" className="report-form__error evidence__rejected">
          {rejected.map(({ name, reason }) => (
            <li key={`${reason}-${name}`}>{t(`rejected.${reason}`, { name, ...LIMITS })}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul aria-label={t('selected')} className="evidence__list">
          {files.map((file) => (
            <li key={keyOf(file)} className="evidence__item">
              <EvidencePreview file={file} />
              <span className="evidence__name">{file.name}</span>
              <button
                type="button"
                className="pwa-button pwa-button--secondary"
                aria-label={t('removeFile', { name: file.name })}
                onClick={() => {
                  remove(file);
                }}
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
