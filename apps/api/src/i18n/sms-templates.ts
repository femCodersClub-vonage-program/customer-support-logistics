import { getTranslator } from './translator.js';

import type { IncidentType, Locale, Order } from '@csl/shared-types';

export function incidentNoticeSms(
  locale: Locale,
  { orderId, incidentType }: { orderId: Order['id']; incidentType: IncidentType },
) {
  const t = getTranslator(locale);

  return t('sms.incidentNotice', { orderId, incidentType: t(`incidentType.${incidentType}`) });
}

export function callSoonSms(
  locale: Locale,
  { orderId, minutes }: { orderId: Order['id']; minutes: number },
) {
  return getTranslator(locale)('sms.callSoon', { orderId, minutes });
}

export function callFallbackSms(locale: Locale, { orderId }: { orderId: Order['id'] }) {
  return getTranslator(locale)('sms.callFallback', { orderId });
}

export function invalidReplySms(locale: Locale) {
  return getTranslator(locale)('sms.invalidReply');
}
