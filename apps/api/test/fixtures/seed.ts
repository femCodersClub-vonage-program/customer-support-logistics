import {
  communications,
  customers,
  drivers,
  incidentEvents,
  incidents,
  orders,
  routes,
} from '../../src/database/schema/index.js';

import type { Database } from '../../src/database/database.constants.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const at = (time: string) => new Date(`2026-11-01T${time}:00.000Z`);

export const ids = {
  ana: uuid(0xc1),
  bruno: uuid(0xc2),
  stranger: uuid(0xc9),
  agentA: uuid(0xa1),
  agentB: uuid(0xa2),
  driver: uuid(0xd1),
  route: uuid(0xe1),
  anaRoutedOrder: uuid(0x01),
  anaOrder: uuid(0x02),
  brunoOrder: uuid(0x03),
  openIncident: uuid(0x101),
  notifiedIncident: uuid(0x102),
  mediationIncident: uuid(0x103),
  resolvedIncident: uuid(0x104),
  escalatedIncident: uuid(0x105),
  missing: uuid(0xfff),
} as const;

export const actor = {
  ana: `customer:${ids.ana}`,
  bruno: `customer:${ids.bruno}`,
  stranger: `customer:${ids.stranger}`,
  agentA: `agent:${ids.agentA}`,
} as const;

export const times = {
  openCreated: at('10:00'),
  openUpdated: at('15:00'),
  notified: at('11:00'),
  mediationCreated: at('12:00'),
  mediationUpdated: at('12:30'),
  resolvedCreated: at('13:00'),
  resolvedUpdated: at('16:00'),
  escalated: at('14:00'),
} as const;

export async function seed(db: Database): Promise<void> {
  await db.insert(customers).values([
    { id: ids.ana, name: 'Ana García', phone: '+34600000001' },
    { id: ids.bruno, name: 'Bruno Díaz', phone: '+34600000002', locale: 'en' },
  ]);

  await db.insert(drivers).values({ id: ids.driver, name: 'Diego Ruiz', phone: '+34600000009' });

  await db.insert(routes).values({ id: ids.route, date: '2026-11-01', driverId: ids.driver });

  await db.insert(orders).values([
    {
      id: ids.anaRoutedOrder,
      customerId: ids.ana,
      routeId: ids.route,
      address: 'Calle Mayor 1',
      status: 'failed',
      createdAt: at('08:00'),
    },
    { id: ids.anaOrder, customerId: ids.ana, address: 'Calle Mayor 1', createdAt: at('09:00') },
    {
      id: ids.brunoOrder,
      customerId: ids.bruno,
      address: 'Gran Vía 2',
      status: 'delivered',
      createdAt: at('08:30'),
    },
  ]);

  await db.insert(incidents).values([
    {
      id: ids.openIncident,
      orderId: ids.anaRoutedOrder,
      type: 'delayed',
      status: 'open',
      createdAt: times.openCreated,
      updatedAt: times.openUpdated,
    },
    {
      id: ids.notifiedIncident,
      orderId: ids.anaRoutedOrder,
      type: 'damaged',
      status: 'notified',
      createdAt: times.notified,
      updatedAt: times.notified,
    },
    {
      id: ids.mediationIncident,
      orderId: ids.anaOrder,
      type: 'not_delivered',
      status: 'in_mediation',
      agentId: ids.agentA,
      createdAt: times.mediationCreated,
      updatedAt: times.mediationUpdated,
    },
    {
      id: ids.resolvedIncident,
      orderId: ids.brunoOrder,
      type: 'wrong_item',
      status: 'resolved',
      agentId: ids.agentA,
      resolution: 'Replacement sent',
      createdAt: times.resolvedCreated,
      updatedAt: times.resolvedUpdated,
      closedAt: times.resolvedUpdated,
    },
    {
      id: ids.escalatedIncident,
      orderId: ids.brunoOrder,
      type: 'delayed',
      status: 'escalated',
      agentId: ids.agentB,
      createdAt: times.escalated,
      updatedAt: times.escalated,
    },
  ]);

  await db.insert(incidentEvents).values([
    {
      incidentId: ids.mediationIncident,
      fromStatus: 'notified',
      toStatus: 'in_mediation',
      actor: 'agent',
      actorId: ids.agentA,
      reason: 'Calling the driver',
      occurredAt: times.mediationUpdated,
    },
    {
      incidentId: ids.mediationIncident,
      fromStatus: null,
      toStatus: 'open',
      actor: 'customer',
      actorId: ids.ana,
      occurredAt: times.mediationCreated,
    },
    {
      incidentId: ids.mediationIncident,
      fromStatus: 'open',
      toStatus: 'notified',
      actor: 'system',
      occurredAt: at('12:10'),
    },
  ]);

  await db.insert(communications).values({
    incidentId: ids.mediationIncident,
    channel: 'sms',
    direction: 'outbound',
    vonageUuid: 'vonage-sms-1',
    status: 'completed',
  });
}
