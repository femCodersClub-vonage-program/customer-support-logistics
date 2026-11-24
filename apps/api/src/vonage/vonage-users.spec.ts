import { describe, expect, it } from 'vitest';

import { parseVonageUserName, vonageUserName } from './vonage-users.js';

const ID = '2b6f0cc9-0d6e-4c3b-8f1a-5e9d7c4a1b20';

describe('vonageUserName', () => {
  it('prefixes customers with cust-', () => {
    expect(vonageUserName({ role: 'customer', id: ID })).toBe(`cust-${ID}`);
  });

  it('prefixes agents with agent-', () => {
    expect(vonageUserName({ role: 'agent', id: ID })).toBe(`agent-${ID}`);
  });
});

describe('parseVonageUserName', () => {
  it.each([
    [`cust-${ID}`, { role: 'customer', id: ID }],
    [`agent-${ID}`, { role: 'agent', id: ID }],
  ])('reads %s', (name, actor) => {
    expect(parseVonageUserName(name)).toEqual(actor);
  });

  it.each([undefined, '', ID, `driver-${ID}`, 'cust-not-a-uuid', `cust-${ID}-extra`, `CUST-${ID}`])(
    'rejects %s',
    (name) => {
      expect(parseVonageUserName(name)).toBeNull();
    },
  );
});
