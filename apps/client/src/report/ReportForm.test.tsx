import { fireEvent, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../test/render.tsx';

import { loadDraft, saveDraft } from './draft.ts';
import { ReportForm } from './ReportForm.tsx';

import type { Incident, Locale } from '@csl/shared-types';

vi.mock('../api.ts', async () => {
  const { createApiClient } = await import('@csl/api-client');

  return { api: createApiClient({ baseUrl: 'http://localhost/api' }) };
});

const ORDER_ID = '3c4d5e6f-0000-4000-8000-000000000001';
const INCIDENT_ID = '6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';
const REPORT_PATH = `/report/${ORDER_ID}`;

const created: Incident = {
  id: INCIDENT_ID,
  orderId: ORDER_ID,
  type: 'damaged',
  status: 'open',
  agentId: null,
  resolution: null,
  createdAt: '2026-11-16T10:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
  closedAt: null,
};

const server = setupServer();
const bodies: unknown[] = [];

function answerWith(respond: () => Response | Promise<Response>) {
  server.use(
    http.post('*/incidents', async ({ request }) => {
      bodies.push(await request.json());

      return respond();
    }),
  );
}

const incidentCreated = () => HttpResponse.json(created, { status: 201 });

function failWith(status: number, error: object) {
  return () => HttpResponse.json({ error }, { status });
}

function Destination() {
  const { pathname } = useLocation();

  return <p>{pathname}</p>;
}

function renderForm(locale: Locale = 'en') {
  return renderWithIntl(
    <MemoryRouter initialEntries={[REPORT_PATH]}>
      <Routes>
        <Route path="report/:orderId" element={<ReportForm orderId={ORDER_ID} />} />
        <Route path="incidents/:id" element={<Destination />} />
        <Route path="login" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
    { locale },
  );
}

function choose(name: string) {
  fireEvent.click(screen.getByRole('radio', { name }));
}

function description() {
  return screen.getByRole('textbox', { name: 'Describe the problem' });
}

function write(value: string) {
  fireEvent.change(description(), { target: { value } });
}

function send() {
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
}

beforeAll(() => {
  server.listen();
});

beforeEach(() => {
  localStorage.clear();
  bodies.length = 0;
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('ReportForm', () => {
  it('sends the report with the trimmed description and opens the incident', async () => {
    answerWith(incidentCreated);
    renderForm();

    choose('Damaged');
    write('  The box was crushed  ');
    send();

    expect(await screen.findByText(`/incidents/${INCIDENT_ID}`)).toBeInTheDocument();
    expect(bodies).toEqual([
      { orderId: ORDER_ID, type: 'damaged', description: 'The box was crushed' },
    ]);
    expect(loadDraft(ORDER_ID)).toEqual({ type: null, description: '' });
  });

  it('does not send a description when there is none', async () => {
    answerWith(incidentCreated);
    renderForm();

    choose('Delayed');
    send();

    expect(await screen.findByText(`/incidents/${INCIDENT_ID}`)).toBeInTheDocument();
    expect(bodies).toEqual([{ orderId: ORDER_ID, type: 'delayed' }]);
  });

  describe('validation', () => {
    it('asks for a type and sends nothing', () => {
      answerWith(incidentCreated);
      renderForm();

      send();

      expect(screen.getByRole('alert')).toHaveTextContent('Choose what happened.');
      expect(screen.getByRole('group', { name: 'What happened?' })).toHaveAccessibleDescription(
        'Choose what happened.',
      );
      expect(bodies).toHaveLength(0);
    });

    it('requires a description for the type other, also when it is only spaces', () => {
      answerWith(incidentCreated);
      renderForm();

      choose('Other');
      write('   ');
      send();

      expect(screen.getByRole('alert')).toHaveTextContent('Describe the problem.');
      expect(description()).toBeInvalid();
      expect(description()).toHaveAccessibleDescription(/Describe the problem\./);
      expect(bodies).toHaveLength(0);
    });

    it('rejects a description over the limit', () => {
      answerWith(incidentCreated);
      renderForm();

      choose('Damaged');
      write('a'.repeat(1001));

      expect(screen.getByText('Optional · 1001 / 1000')).toBeInTheDocument();

      send();

      expect(screen.getByRole('alert')).toHaveTextContent(
        'The description is too long. Use at most 1000 characters.',
      );
      expect(bodies).toHaveLength(0);
    });

    it('counts the description without the spaces around it', () => {
      renderForm();

      write('  hello  ');

      expect(screen.getByText('Optional · 5 / 1000')).toBeInTheDocument();
    });

    it('says the description is required for the type other', () => {
      renderForm();

      choose('Other');

      expect(screen.getByText('Required · 0 / 1000')).toBeInTheDocument();
      expect(description()).toBeRequired();
    });

    it('clears the type error when a type is chosen', () => {
      renderForm();

      send();
      expect(screen.getByRole('alert')).toHaveTextContent('Choose what happened.');

      choose('Damaged');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('clears the description error when the description changes', () => {
      renderForm();

      choose('Other');
      send();
      expect(description()).toBeInvalid();

      write('Wrong floor');

      expect(description()).toBeValid();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('clears the description error when the type no longer needs one', () => {
      renderForm();

      choose('Other');
      send();
      expect(description()).toBeInvalid();

      choose('Damaged');

      expect(description()).toBeValid();
    });
  });

  describe('server errors', () => {
    it('shows a field error next to its field and lets the customer try again', async () => {
      answerWith(
        failWith(400, {
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          details: [{ path: 'description', message: 'Description is not valid' }],
        }),
      );
      renderForm();

      choose('Damaged');
      write('The box was crushed');
      send();

      expect(await screen.findByRole('alert')).toHaveTextContent('Description is not valid');
      expect(description()).toHaveAccessibleDescription(/Description is not valid/);
      expect(screen.getByRole('button', { name: 'Send report' })).toBeEnabled();
    });

    it('says when the order does not exist', async () => {
      answerWith(failWith(404, { code: 'NOT_FOUND', message: 'Order not found' }));
      renderForm();

      choose('Damaged');
      send();

      expect(await screen.findByRole('alert')).toHaveTextContent('We could not find this order.');
    });

    it.each([403, 409, 500])(
      'shows a general error and keeps the draft when the server answers %s',
      async (status) => {
        answerWith(failWith(status, { code: 'INTERNAL_ERROR', message: 'Something failed' }));
        renderForm();

        choose('Damaged');
        write('The box was crushed');
        send();

        expect(await screen.findByRole('alert')).toHaveTextContent(
          'We could not send the report. Try again in a moment.',
        );
        expect(screen.getByRole('button', { name: 'Send report' })).toBeEnabled();
        expect(loadDraft(ORDER_ID)).toEqual({
          type: 'damaged',
          description: 'The box was crushed',
        });
      },
    );

    it('sends the customer to the login when the session has expired', async () => {
      answerWith(failWith(401, { code: 'UNAUTHORIZED', message: 'A valid session is required' }));
      renderForm();

      choose('Damaged');
      write('The box was crushed');
      send();

      expect(await screen.findByText('/login')).toBeInTheDocument();
      expect(loadDraft(ORDER_ID)).toEqual({ type: 'damaged', description: 'The box was crushed' });
    });
  });

  it('blocks a second send while the first one is on its way', async () => {
    answerWith(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));

      return incidentCreated();
    });
    renderForm();

    choose('Damaged');
    send();

    const button = screen.getByRole('button', { name: 'Send report' });

    expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Sending… this may take a moment.');

    fireEvent.click(button);

    expect(await screen.findByText(`/incidents/${INCIDENT_ID}`)).toBeInTheDocument();
    expect(bodies).toHaveLength(1);
  });

  it('ignores a second submit fired before the form is blocked', async () => {
    answerWith(incidentCreated);
    renderForm();

    choose('Damaged');

    const form = screen
      .getByRole('button', { name: 'Send report' })
      .closest('form') as HTMLFormElement;

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(await screen.findByText(`/incidents/${INCIDENT_ID}`)).toBeInTheDocument();
    expect(bodies).toHaveLength(1);
  });

  it('does not clear the draft when the customer leaves before the answer', async () => {
    answerWith(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));

      return incidentCreated();
    });

    const { unmount } = renderForm();

    choose('Damaged');
    send();
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(loadDraft(ORDER_ID)).toEqual({ type: 'damaged', description: '' });
  });

  describe('draft', () => {
    it('restores the draft when the page is opened again', () => {
      saveDraft(ORDER_ID, { type: 'damaged', description: 'The box was crushed' });
      renderForm();

      expect(screen.getByRole('radio', { name: 'Damaged' })).toBeChecked();
      expect(description()).toHaveValue('The box was crushed');
    });

    it('saves the draft while the customer fills the form', () => {
      renderForm();

      choose('Delayed');
      write('Two days late');

      expect(loadDraft(ORDER_ID)).toEqual({ type: 'delayed', description: 'Two days late' });
    });
  });

  it('renders in Spanish', () => {
    renderForm('es');

    expect(screen.getByRole('group', { name: '¿Qué ha pasado?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dañado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar reporte' })).toBeInTheDocument();
  });
});
