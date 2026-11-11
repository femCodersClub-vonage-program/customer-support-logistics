import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';

const FAST_COST = { N: 2 ** 10, r: 8, p: 1 };

describe('password hashing', () => {
  it('accepts the password it was hashed from', async () => {
    const hash = await hashPassword('correct horse battery staple', FAST_COST);

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects any other password', async () => {
    const hash = await hashPassword('correct horse battery staple', FAST_COST);

    await expect(verifyPassword('Correct horse battery staple', hash)).resolves.toBe(false);
  });

  it('salts every hash, so the same password gives different hashes', async () => {
    const first = await hashPassword('same password', FAST_COST);
    const second = await hashPassword('same password', FAST_COST);

    expect(first).not.toBe(second);
  });

  it('stores the cost next to the hash, so it can be raised without breaking old hashes', async () => {
    const hash = await hashPassword('same password', FAST_COST);

    expect(hash.split('$').slice(0, 4)).toEqual(['scrypt', '1024', '8', '1']);
    await expect(verifyPassword('same password', hash)).resolves.toBe(true);
  });

  it('treats a composed and a decomposed accent as the same password', async () => {
    const hash = await hashPassword('contraseña', FAST_COST);

    await expect(verifyPassword('contraseña', hash)).resolves.toBe(true);
  });

  it('fails loudly on a stored hash it cannot read', async () => {
    await expect(verifyPassword('anything', 'bcrypt$whatever')).rejects.toThrow(/unknown format/);
  });
});
