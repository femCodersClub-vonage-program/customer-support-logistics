import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const deleted = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ delete: deleted }),
}));

describe('GET /session-expired', () => {
  it('deletes the dead session cookie and sends the agent to log in again', async () => {
    const response = await GET(
      new NextRequest('http://crm.test/session-expired?next=%2Fincidents%2F1'),
    );

    expect(deleted).toHaveBeenCalledWith('csl_session');
    expect(response.headers.get('location')).toBe('http://crm.test/login?next=%2Fincidents%2F1');
  });

  it('never keeps a way back that leaves the CRM', async () => {
    const response = await GET(
      new NextRequest('http://crm.test/session-expired?next=%2F.%2F%2Fevil.com'),
    );

    expect(response.headers.get('location')).toBe('http://crm.test/login?next=%2Finbox');
  });
});
