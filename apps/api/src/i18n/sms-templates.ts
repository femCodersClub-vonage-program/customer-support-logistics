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

export function mediationInviteSms(
  locale: Locale,
  { orderId, url }: { orderId: Order['id']; url: string },
) {
  return getTranslator(locale)('sms.mediationInvite', { orderId, url });
}

export function invalidReplySms(locale: Locale) {
  return getTranslator(locale)('sms.invalidReply');
}

export function resolvedCustomerSms(locale: Locale, { orderId }: { orderId: Order['id'] }) {
  return getTranslator(locale)('sms.resolvedCustomer', { orderId });
}

export function resolvedDriverSms(locale: Locale, { orderId }: { orderId: Order['id'] }) {
  return getTranslator(locale)('sms.resolvedDriver', { orderId });
}

export function escalatedCustomerSms(locale: Locale, { orderId }: { orderId: Order['id'] }) {
  return getTranslator(locale)('sms.escalatedCustomer', { orderId });
}
