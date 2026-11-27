import { ApiError } from '@csl/api-client';
import {
  apiErrorResponseSchema,
  createIncidentBodySchema,
  INCIDENT_DESCRIPTION_MAX_LENGTH,
} from '@csl/contracts';
import { INCIDENT_TYPES } from '@csl/shared-types';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';

import { api } from '../api.ts';
import { useSession } from '../auth/session-context.ts';
import { rememberCustomerIncident } from '../incident/known-incidents.ts';

import { clearDraft, loadDraft, saveDraft } from './draft.ts';
import { EvidencePicker } from './EvidencePicker.tsx';
import './report.css';
import { uploadEvidenceFiles } from './upload-evidence.ts';

import type { FileUploadState, PutFileFn } from './upload-evidence.ts';
import type { IncidentType } from '@csl/shared-types';
import type { FormEvent } from 'react';

const TYPE_ICONS: Record<IncidentType, string> = {
  not_delivered: '📭',
  delayed: '⏰',
  damaged: '💥',
  wrong_item: '🔄',
  other: '❔',
};

const PHOTO_SUGGESTED_TYPES = new Set<IncidentType>(['damaged', 'wrong_item']);
const SLOW_UPLOAD_NOTICE_MS = 3000;

type Field = 'type' | 'description';
type FieldErrors = Partial<Record<Field, string>>;
type FallbackKey = 'errors.orderNotFound' | 'errors.generic';

function serverFieldErrors(error: unknown): FieldErrors {
  const parsed =
    error instanceof ApiError ? apiErrorResponseSchema.safeParse(error.body) : undefined;
  const details = parsed?.success ? (parsed.data.error.details ?? []) : [];
  const errors: FieldErrors = {};

  for (const { path, message } of details) {
    if (path === 'type' || path === 'description') {
      errors[path] ??= message;
    }
  }

  return errors;
}

export interface ReportFormProps {
  orderId: string;
  putFile?: PutFileFn;
  slowUploadNoticeMs?: number;
}

export function ReportForm({
  orderId,
  putFile,
  slowUploadNoticeMs = SLOW_UPLOAD_NOTICE_MS,
}: Readonly<ReportFormProps>) {
  const t = useTranslations('report');
  const tType = useTranslations('incident.type');
  const navigate = useNavigate();
  const { state: sessionState, logOut } = useSession();
  const id = useId();
  const sendingRef = useRef<AbortController | null>(null);
  const [initial] = useState(() => loadDraft(orderId));
  const [type, setType] = useState<IncidentType | null>(initial.type);
  const [description, setDescription] = useState(initial.description);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStates, setUploadStates] = useState<readonly FileUploadState[]>([]);
  const [slowConnection, setSlowConnection] = useState(false);

  useEffect(() => {
    saveDraft(orderId, { type, description });
  }, [orderId, type, description]);

  useEffect(
    () => () => {
      sendingRef.current?.abort();
    },
    [],
  );

  const isUploading = submitting && uploadStates.length > 0;

  useEffect(() => {
    if (!isUploading) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setSlowConnection(true);
    }, slowUploadNoticeMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isUploading, slowUploadNoticeMs]);

  const trimmed = description.trim();
  const typeErrorId = `${id}-type-error`;
  const descriptionId = `${id}-description`;
  const hintId = `${id}-hint`;
  const descriptionErrorId = `${id}-description-error`;

  function showErrors(fields: FieldErrors, fallbackKey: FallbackKey) {
    setErrors(fields);
    setFailure(Object.keys(fields).length > 0 ? null : t(fallbackKey));
  }

  function clearTypeError() {
    setErrors(({ description: descriptionError }) =>
      descriptionError === undefined || trimmed.length <= INCIDENT_DESCRIPTION_MAX_LENGTH
        ? {}
        : { description: descriptionError },
    );
  }

  function clearDescriptionError() {
    setErrors(({ type: typeError }) => (typeError === undefined ? {} : { type: typeError }));
  }

  function uploadPhaseLabel(entry: FileUploadState): string {
    if (entry.phase === 'uploading' && entry.progress > 0) {
      return t('uploadStatus.uploadingPercent', { percent: entry.progress });
    }

    return t(`uploadStatus.${entry.phase}`);
  }

  function statusMessage(): string | false {
    if (!submitting) {
      return false;
    }

    if (uploadStates.length === 0) {
      return t('sending');
    }

    const finished = uploadStates.filter(
      (entry) => entry.phase === 'done' || entry.phase === 'failed',
    ).length;

    return t('uploading', {
      current: Math.min(finished + 1, uploadStates.length),
      total: uploadStates.length,
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sendingRef.current) {
      return;
    }

    const parsed = createIncidentBodySchema.safeParse({
      orderId,
      type: type ?? undefined,
      description: trimmed === '' ? undefined : trimmed,
    });

    if (!parsed.success) {
      const next: FieldErrors = {};

      for (const { path, code } of parsed.error.issues) {
        if (path[0] === 'type') {
          next.type = t('errors.type');
        } else if (path[0] === 'description') {
          next.description =
            code === 'too_big'
              ? t('errors.descriptionTooLong', { max: INCIDENT_DESCRIPTION_MAX_LENGTH })
              : t('errors.descriptionRequired');
        }
      }

      showErrors(next, 'errors.orderNotFound');

      return;
    }

    const request = new AbortController();
    const selectedFiles = [...files];

    sendingRef.current = request;
    setErrors({});
    setFailure(null);
    setSubmitting(true);
    setUploadStates([]);
    setSlowConnection(false);

    void (async () => {
      try {
        const incident = await api.createIncident(parsed.data, { signal: request.signal });

        if (request.signal.aborted) {
          return;
        }

        if (sessionState.status === 'ready' && sessionState.user) {
          rememberCustomerIncident(sessionState.user.id, incident.id);
        }

        clearDraft(orderId);

        let failedCount = 0;

        if (selectedFiles.length > 0) {
          const result = await uploadEvidenceFiles(incident.id, selectedFiles, {
            signal: request.signal,
            putFile,
            onProgress: (states) => {
              if (!request.signal.aborted) {
                setUploadStates(states);
              }
            },
          });

          failedCount = result.failed.length;
        }

        if (request.signal.aborted) {
          return;
        }

        await navigate(`/incidents/${incident.id}`, {
          state: failedCount > 0 ? { failedEvidenceCount: failedCount } : undefined,
        });
      } catch (error: unknown) {
        if (request.signal.aborted) {
          return;
        }

        sendingRef.current = null;
        setSubmitting(false);
        setUploadStates([]);
        setSlowConnection(false);

        if (error instanceof ApiError && error.status === 401) {
          await logOut().catch(() => undefined);

          return;
        }

        showErrors(
          serverFieldErrors(error),
          error instanceof ApiError && error.status === 404
            ? 'errors.orderNotFound'
            : 'errors.generic',
        );
      }
    })();
  }

  return (
    <form className="report-form" onSubmit={handleSubmit} aria-busy={submitting} noValidate>
      <fieldset
        className="report-form__group"
        disabled={submitting}
        aria-describedby={errors.type ? typeErrorId : undefined}
      >
        <legend className="report-form__legend">{t('type')}</legend>
        <div className="report-form__types">
          {INCIDENT_TYPES.map((value) => (
            <label key={value} className="report-type">
              <input
                className="report-type__input"
                type="radio"
                name="type"
                value={value}
                checked={type === value}
                onChange={() => {
                  setType(value);
                  clearTypeError();
                }}
              />
              <span className="report-type__card">
                <span aria-hidden="true" className="report-type__icon">
                  {TYPE_ICONS[value]}
                </span>
                {tType(value)}
              </span>
            </label>
          ))}
        </div>
        {errors.type && (
          <p id={typeErrorId} role="alert" className="report-form__error">
            {errors.type}
          </p>
        )}
      </fieldset>

      <EvidencePicker
        files={files}
        onChange={setFiles}
        suggestPhoto={type !== null && PHOTO_SUGGESTED_TYPES.has(type)}
        disabled={submitting}
      />

      <div className="report-form__group">
        <label className="report-form__label" htmlFor={descriptionId}>
          {t('description')}
        </label>
        <textarea
          id={descriptionId}
          className="report-form__textarea"
          rows={5}
          value={description}
          readOnly={submitting}
          aria-required={type === 'other'}
          aria-invalid={errors.description !== undefined}
          aria-describedby={errors.description ? `${hintId} ${descriptionErrorId}` : hintId}
          onChange={(event) => {
            setDescription(event.target.value);
            clearDescriptionError();
          }}
        />
        <p id={hintId} className="report-form__hint">
          {t(type === 'other' ? 'hintRequired' : 'hintOptional', {
            count: trimmed.length,
            max: INCIDENT_DESCRIPTION_MAX_LENGTH,
          })}
        </p>
        {errors.description && (
          <p id={descriptionErrorId} role="alert" className="report-form__error">
            {errors.description}
          </p>
        )}
      </div>

      {failure && (
        <p role="alert" className="report-form__error">
          {failure}
        </p>
      )}

      {uploadStates.length > 0 && (
        <ul className="report-uploads" aria-label={t('uploadListLabel')}>
          {uploadStates.map((entry, index) => (
            <li
              key={`${entry.file.name}-${String(index)}`}
              className={`report-uploads__item report-uploads__item--${entry.phase}`}
            >
              <div className="report-uploads__row">
                <span className="report-uploads__name">{entry.file.name}</span>
                <span className="report-uploads__state">{uploadPhaseLabel(entry)}</span>
              </div>
              <progress
                className="report-uploads__progress"
                value={entry.progress}
                max={100}
                aria-label={entry.file.name}
              />
            </li>
          ))}
        </ul>
      )}

      {slowConnection && isUploading && (
        <p className="report-form__slow-notice">{t('slowConnection')}</p>
      )}

      <p role="status" className="report-form__hint">
        {statusMessage()}
      </p>

      <button type="submit" className="pwa-button report-form__submit" disabled={submitting}>
        {t('submit')}
      </button>
    </form>
  );
}
