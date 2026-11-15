import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from './proxy';

describe('proxy', () => {
  it('sends an agent without a session to the login with the way back', () => {
    const response = proxy(new NextRequest('http://crm.test/incidents/1/mediation?tab=call'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/login');
    expect(new URL(response.headers.get('location') ?? '').searchParams.get('next')).toBe(
      '/incidents/1/mediation?tab=call',
    );
  });

  it('shows the login to an agent without a session', () => {
    expect(proxy(new NextRequest('http://crm.test/login')).headers.get('location')).toBeNull();
  });

  it('sends an agent who already has a session from the login to the page they asked for', () => {
    const request = new NextRequest('http://crm.test/login?next=%2Fincidents%2F1', {
      headers: { cookie: 'csl_session=token' },
    });

    expect(new URL(proxy(request).headers.get('location') ?? '').pathname).toBe('/incidents/1');
  });

  it('never sends an agent from the login to another site', () => {
    const request = new NextRequest('http://crm.test/login?next=https%3A%2F%2Fevil.com', {
      headers: { cookie: 'csl_session=token' },
    });

    expect(proxy(request).headers.get('location')).toBe('http://crm.test/inbox');
  });

  it('lets an agent with a session cookie through', () => {
    const request = new NextRequest('http://crm.test/inbox', {
      headers: { cookie: 'csl_session=token' },
    });

    expect(proxy(request).headers.get('location')).toBeNull();
  });
});
