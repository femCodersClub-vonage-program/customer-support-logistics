import type { IncidentEvent, IncidentEventKind } from '@csl/shared-types';

const CUSTOMER_EVENT_KINDS = [
  'status_changed',
  'evidence_uploaded',
  'assigned',
  'driver_joined',
] as const satisfies readonly IncidentEventKind[];

export type CustomerEventKind = (typeof CUSTOMER_EVENT_KINDS)[number];

export type CustomerEvent = IncidentEvent & { kind: CustomerEventKind };

function isCustomerEvent(event: IncidentEvent): event is CustomerEvent {
  return CUSTOMER_EVENT_KINDS.some((kind) => kind === event.kind);
}

export function customerEvents(events: readonly IncidentEvent[]): CustomerEvent[] {
  let assignedShown = false;

  return [...events]
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .filter(isCustomerEvent)
    .filter((event) => {
      if (event.kind !== 'assigned') {
        return true;
      }

      if (assignedShown) {
        return false;
      }

      assignedShown = true;
      return true;
    });
}
