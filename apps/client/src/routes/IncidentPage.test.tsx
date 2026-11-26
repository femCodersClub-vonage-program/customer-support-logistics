import { fireEvent, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DATE_TIME_FORMAT } from '../incident/date-format.ts';
import {
  CUSTOMER,
  apiError,
  apiUrl,
  incidentDetailOf,
  incidentOf,
  renderApp,
  sessionOf,
} from '../test/app.tsx';

import type { EvidenceDownload, IncidentDetail } from '@csl/contracts';
import type { IncidentEvent } from '@csl/shared-types';

const INCIDENT_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const ORDER_ID = '3c4d5e6f-0000-4000-8000-000000000001';
const EVIDENCE_ID = '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const CREATED_AT = '2026-11-20T09:30:00.000Z';
const NOTIFIED_AT = '2026-11-20T10:15:00.000Z';

const event = (id: string, overrides: Partial<IncidentEvent>): IncidentEvent => ({
  id,
  incidentId: INCIDENT_ID,
  kind: 'status_changed',
  fromStatus: null,
  toStatus: 'open',
  actor: 'customer',
  actorId: CUSTOMER.id,
  reason: null,
  occurredAt: CREATED_AT,
  ...overrides,
});

const incident = (overrides: Partial<IncidentDetail> = {}): IncidentDetail =>
  incidentDetailOf(INCIDENT_ID, {
    orderId: ORDER_ID,
    createdAt: CREATED_AT,
    updatedAt: NOTIFIED_AT,
    description: 'The box arrived crushed',
    events: [
      event('created', {}),
      event('evidence', { kind: 'evidence_uploaded', occurredAt: '2026-11-20T09:31:00.000Z' }),
      event('notified', {
        fromStatus: 'open',
        toStatus: 'notified',
        actor: 'agent',
        reason: 'Internal note for the driver team',
        occurredAt: NOTIFIED_AT,
      }),
      event('resent', {
        kind: 'driver_notification_resent',
        toStatus: 'notified',
        actor: 'agent',
        occurredAt: '2026-11-20T10:45:00.000Z',
      }),
    ],
    evidence: [
      {
        id: EVIDENCE_ID,
        incidentId: INCIDENT_ID,
        storageKey: `incidents/${INCIDENT_ID}/${EVIDENCE_ID}`,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        status: 'ready',
        createdAt: '2026-11-20T09:31:00.000Z',
      },
    ],
    ...overrides,
  });

const evidenceDownload: EvidenceDownload = {
  id: EVIDENCE_ID,
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
  createdAt: '2026-11-20T09:31:00.000Z',
  downloadUrl: 'https://storage.test/photo.jpg',
};

const incidentAnswers = (response: () => Response) =>
  http.get(apiUrl(`/incidents/${INCIDENT_ID}`), response);

const evidenceOf = (items: EvidenceDownload[]) =>
  http.get(apiUrl(`/incidents/${INCIDENT_ID}/evidence`), () => HttpResponse.json(items));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  server.use(sessionOf(CUSTOMER), evidenceOf([evidenceDownload]));
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const openIncident = (locale: 'en' | 'es' = 'en') => renderApp(`/incidents/${INCIDENT_ID}`, locale);

const section = (name: string) => screen.getByRole('region', { name });

describe('/incidents/:id', () => {
  it('shows the summary, the evidence and the customer timeline', async () => {
    server.use(incidentOf(incident()));
    openIncident();

    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(screen.getByRole('heading', { level: 1, name: 'Incident' })).toBeInTheDocument();
    expect(within(summary).getByText(ORDER_ID)).toBeInTheDocument();
    expect(within(summary).getByText('Damaged')).toBeInTheDocument();
    expect(within(summary).getByText('The box arrived crushed')).toBeInTheDocument();

    expect(await screen.findByRole('img', { name: 'Photo 1' })).toHaveAttribute(
      'src',
      evidenceDownload.downloadUrl,
    );

    const timeline = within(section('Incident timeline')).getAllByRole('listitem');
    expect(timeline.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'You reported the incident',
      'You added a photo or video',
      'We notified the driver',
    ]);
    expect(screen.queryByText('Internal note for the driver team')).not.toBeInTheDocument();
  });

  it.each([
    [
      'open',
      'Step 1 of 4: Reported',
      'Current step: Reported',
      "We've received your report. Next, we'll let the driver know so they can check what happened.",
    ],
    [
      'notified',
      'Step 2 of 4: Driver notified',
      'Current step: Driver notified',
      "The driver knows about your incident. Next, we'll set up a call with you, the driver and our support team.",
    ],
    [
      'in_mediation',
      'Step 3 of 4: In mediation',
      'Current step: In mediation',
      "We're setting up a call with you, the driver and our support team. We'll send you an SMS when it's ready.",
    ],
    [
      'resolved',
      'Step 4 of 4: Resolved',
      'Current step: Resolved',
      "Your incident is resolved. There's nothing else you need to do.",
    ],
    [
      'escalated',
      'Step 4 of 4: Escalated',
      'Current step: Escalated',
      "We've passed your incident to a specialist team. They'll contact you to sort it out.",
    ],
  ] as const)(
    'explains a %s incident in words, not only colour',
    async (status, summary, current, next) => {
      server.use(incidentOf(incident({ status })));
      openIncident();

      const progress = await screen.findByRole('region', { name: 'Current status' });
      expect(within(progress).getByText(summary)).toBeInTheDocument();
      expect(within(progress).getByRole('listitem', { current: 'step' })).toHaveTextContent(
        current,
      );
      expect(within(progress).getByText(next)).toBeInTheDocument();
    },
  );

  it('offers to join the call when it is waiting', async () => {
    server.use(
      incidentOf(
        incident({
          status: 'in_mediation',
          mediationInvite: {
            url: `https://client.test/call/${INCIDENT_ID}`,
            sentAt: NOTIFIED_AT,
          },
        }),
      ),
    );
    openIncident();

    expect(await screen.findByRole('link', { name: 'Join the call' })).toHaveAttribute(
      'href',
      `/call/${INCIDENT_ID}`,
    );
    expect(
      screen.getByText(
        'Your call is ready. Join it to sort out the incident with the driver and our support team.',
      ),
    ).toBeInTheDocument();
  });

  it('does not offer the call before the invite is sent', async () => {
    server.use(incidentOf(incident({ status: 'in_mediation', mediationInvite: null })));
    openIncident();

    expect(await screen.findByRole('region', { name: 'Current status' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Join the call' })).not.toBeInTheDocument();
  });

  it('shows "not found" when the incident belongs to someone else', async () => {
    server.use(incidentAnswers(() => apiError(404, 'NOT_FOUND')));
    openIncident();

    expect(
      await screen.findByRole('heading', { name: "We can't find this incident" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to my orders' })).toHaveAttribute(
      'href',
      '/orders',
    );
  });

  it('shows "not found" without asking the API when the id is not valid', async () => {
    renderApp('/incidents/not-a-uuid');

    expect(
      await screen.findByRole('heading', { name: "We can't find this incident" }),
    ).toBeInTheDocument();
  });

  it('lets the customer retry when the incident cannot be loaded', async () => {
    server.use(incidentAnswers(() => apiError(500, 'INTERNAL_ERROR')));
    openIncident();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load your incident. Please try again.",
    );

    server.use(incidentOf(incident()));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('region', { name: 'Summary' })).toBeInTheDocument();
  });

  it('shows the timeline dates in the customer locale', async () => {
    server.use(incidentOf(incident()));
    openIncident('es');

    const timeline = await screen.findByRole('region', { name: 'Seguimiento de la incidencia' });
    const expected = new Intl.DateTimeFormat('es', DATE_TIME_FORMAT).format(new Date(NOTIFIED_AT));

    expect(within(timeline).getByText(expected)).toHaveAttribute('dateTime', NOTIFIED_AT);
    expect(within(timeline).getByText('Hemos avisado al repartidor')).toBeInTheDocument();
  });
});
