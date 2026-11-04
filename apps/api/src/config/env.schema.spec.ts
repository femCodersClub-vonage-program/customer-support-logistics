import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

describe('validateEnv', () => {
  it('applies defaults when optional variables are missing', () => {
    expect(validateEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3000 });
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ NODE_ENV: 'production', PORT: '8080' })).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
    });
  });

  it('throws when a variable is invalid', () => {
    expect(() => validateEnv({ PORT: 'not-a-port' })).toThrow(/Invalid environment variables/);
  });
});
