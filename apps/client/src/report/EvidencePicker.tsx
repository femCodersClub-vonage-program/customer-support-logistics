import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import {
  addFiles,
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_IMAGE_BYTES,
  EVIDENCE_MAX_VIDEO_BYTES,
  mimeTypeOf,
} from './evidence-files.ts';
import './evidence.css';

import type { EvidenceRejection } from './evidence-files.ts';
import type { ChangeEvent } from 'react';

const CAMERA = 'environment';
const FILE_ICON = '🖼️';
const MB = 1024 * 1024;
const NOT_SHOWN_BY_BROWSERS = new Set(['image/heic', 'image/heif']);

const LIMITS = {
  maxFiles: EVIDENCE_MAX_FILES,
  imageMb: EVIDENCE_MAX_IMAGE_BYTES / MB,
  videoMb: EVIDENCE_MAX_VIDEO_BYTES / MB,
};

const keys = new WeakMap<object, string>();
let nextKey = 0;

function keyOf(item: object): string {
  let key = keys.get(item);

  if (key === undefined) {
    key = String(nextKey++);
    keys.set(item, key);
  }

  return key;
}

function EvidencePreview({ file }: Readonly<{ file: File }>) {
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const type = mimeTypeOf(file);

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

  if (type.startsWith('video/')) {
    return (
      <video
        className="evidence-preview"
        src={url}
        muted
        controls
        preload="metadata"
        aria-label={file.name}
      />
    );
  }

  if (broken || NOT_SHOWN_BY_BROWSERS.has(type)) {
    return (
      <span aria-hidden="true" className="evidence-preview evidence-preview--file">
        {FILE_ICON}
      </span>
    );
  }

  return (
    <img
      className="evidence-preview"
      src={url}
      alt=""
      onError={() => {
        setBroken(true);
      }}
    />
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
  const [rejection, setRejection] = useState<{ batch: number; items: EvidenceRejection[] }>({
    batch: 0,
    items: [],
  });

  const needsPhoto = suggestPhoto && !files.some((file) => mimeTypeOf(file).startsWith('image/'));

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);

    event.target.value = '';

    if (incoming.length === 0) {
      return;
    }

    const result = addFiles(files, incoming);

    onChange(result.files);
    setRejection(({ batch }) => ({ batch: batch + 1, items: result.rejected }));
  }

  function remove(file: File) {
    onChange(files.filter((candidate) => candidate !== file));
    setRejection(({ batch }) => ({ batch, items: [] }));
  }

  return (
    <fieldset className="report-form__group" disabled={disabled}>
      <legend className="report-form__legend">{t('title')}</legend>

      <div className="evidence__actions">
        <label className="evidence-button">
          <input
            className="evidence-button__input"
            type="file"
            accept={EVIDENCE_ACCEPT}
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
            accept={EVIDENCE_ACCEPT}
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

      {rejection.items.length > 0 && (
        <div key={rejection.batch} role="alert" className="report-form__error">
          <ul className="evidence__rejected">
            {rejection.items.map((item) => (
              <li key={keyOf(item)}>
                {t(`rejected.${item.reason}`, { name: item.name, ...LIMITS })}
              </li>
            ))}
          </ul>
        </div>
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
