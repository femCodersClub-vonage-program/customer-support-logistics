import { describe, expect, it } from 'vitest';

import { parseDriverReply } from './driver-reply.js';

describe('parseDriverReply', () => {
  it.each(['1', '2', '3'])('accepts the option %s', (option) => {
    expect(parseDriverReply(option)).toBe(option);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseDriverReply(' 2\n')).toBe('2');
  });

  it.each(['', '4', '0', '12', '1 2', 'uno', 'ok', 'constructor', 'toString'])(
    'rejects %j',
    (text) => {
      expect(parseDriverReply(text)).toBeNull();
    },
  );
});
