import { uuidSchema } from '@csl/contracts';

const PREFIX = 'csl:customer-incidents:';
const MAX_STORED = 50;

function keyFor(customerId: string): string {
  return `${PREFIX}${customerId}`;
}

export function readCustomerIncidents(customerId: string): string[] {
  try {
    const raw = window.localStorage.getItem(keyFor(customerId));

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is string => typeof item === 'string' && uuidSchema.safeParse(item).success,
    );
  } catch {
    return [];
  }
}

export function rememberCustomerIncident(customerId: string, incidentId: string): void {
  if (!uuidSchema.safeParse(incidentId).success) {
    return;
  }

  try {
    const existing = readCustomerIncidents(customerId).filter((id) => id !== incidentId);
    const next = [incidentId, ...existing].slice(0, MAX_STORED);

    window.localStorage.setItem(keyFor(customerId), JSON.stringify(next));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}
