import { describe, expect, it } from 'vitest';

import { parseDevActor } from './dev-actor.js';

const ID = '0b9f1c9e-8a43-4d1e-9a51-3f3c2b8a7d10';

describe('parseDevActor', () => {
  it('parses customer and agent actors', () => {
    expect(parseDevActor(`customer:${ID}`)).toEqual({ role: 'customer', id: ID });
    expect(parseDevActor(`agent:${ID}`)).toEqual({ role: 'agent', id: ID });
  });

  it.each([
    undefined,
    ['customer', ID],
    '',
    'customer',
    `driver:${ID}`,
    'customer:not-a-uuid',
    `customer:${ID}:extra`,
  ])('rejects %j', (header) => {
    expect(parseDevActor(header)).toBeNull();
  });
});
