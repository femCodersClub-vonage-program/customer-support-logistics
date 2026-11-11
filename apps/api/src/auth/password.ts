import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

const ALGORITHM = 'scrypt';
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

export const DEFAULT_SCRYPT_COST: ScryptCost = { N: 2 ** 14, r: 8, p: 5 };

const costParameter = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number);

const storedHashSchema = z
  .string()
  .transform((value) => value.split('$'))
  .pipe(
    z.tuple([
      z.literal(ALGORITHM),
      costParameter,
      costParameter,
      costParameter,
      z.base64url().min(1),
      z.base64url().min(1),
    ]),
  )
  .transform(([, N, r, p, salt, key]) => ({
    cost: { N, r, p },
    salt: Buffer.from(salt, 'base64url'),
    key: Buffer.from(key, 'base64url'),
  }));

function deriveKey(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { ...cost, maxmem: MAX_MEMORY_BYTES },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(
  password: string,
  cost: ScryptCost = DEFAULT_SCRYPT_COST,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, cost);

  return [
    ALGORITHM,
    cost.N,
    cost.r,
    cost.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const result = storedHashSchema.safeParse(storedHash);

  if (!result.success) {
    throw new Error('Stored password hash has an unknown format');
  }

  const { cost, salt, key } = result.data;
  const candidate = await deriveKey(password, salt, cost);

  return candidate.length === key.length && timingSafeEqual(candidate, key);
}
