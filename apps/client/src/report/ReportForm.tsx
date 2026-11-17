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

import { clearDraft, loadDraft, saveDraft } from './draft.ts';
import './report.css';

import type { IncidentType } from '@csl/shared-types';
import type { FormEvent } from 'react';

const TYPE_ICONS: Record<IncidentType, string> = {
  not_delivered: '📭',
  delayed: '⏰',
  damaged: '💥',
  wrong_item: '🔄',
  other: '❔',
};

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

export function ReportForm({ orderId }: Readonly<{ orderId: string }>) {
  const t = useTranslations('report');
  const tType = useTranslations('incident.type');
  const navigate = useNavigate();
  const id = useId();
  const sending = useRef<AbortController | null>(null);
  const [initial] = useState(() => loadDraft(orderId));
  const [type, setType] = useState<IncidentType | null>(initial.type);
  const [description, setDescription] = useState(initial.description);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    saveDraft(orderId, { type, description });
  }, [orderId, type, description]);

  useEffect(
    () => () => {
      sending.current?.abort();
    },
    [],
  );

  const trimmed = description.trim();
  const typeErrorId = `${id}-type-error`;
  const descriptionId = `${id}-description`;
  const hintId = `${id}-hint`;
  const descriptionErrorId = `${id}-description-error`;

  function showErrors(fields: FieldErrors, fallbackKey: FallbackKey) {
    setErrors(fields);
    setFailure(Object.keys(fields).length > 0 ? null : t(fallbackKey));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sending.current) {
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

    sending.current = request;
    setErrors({});
    setFailure(null);
    setSubmitting(true);

    api
      .createIncident(parsed.data, { signal: request.signal })
      .then((incident) => {
        clearDraft(orderId);

        return navigate(`/incidents/${incident.id}`);
      })
      .catch((error: unknown) => {
        if (request.signal.aborted) {
          return;
        }

        sending.current = null;
        setSubmitting(false);

        if (error instanceof ApiError && error.status === 401) {
          return navigate('/login');
        }

        showErrors(
          serverFieldErrors(error),
          error instanceof ApiError && error.status === 404
            ? 'errors.orderNotFound'
            : 'errors.generic',
        );
      });
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

      <p role="status" className="report-form__hint">
        {submitting && t('sending')}
      </p>

      <button type="submit" className="pwa-button report-form__submit" disabled={submitting}>
        {t('submit')}
      </button>
    </form>
  );
}
