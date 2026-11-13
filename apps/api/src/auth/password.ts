import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { z } from 'zod';

interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

const ALGORITHM = 'scrypt';
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;

export const DEFAULT_SCRYPT_COST: ScryptCost = { N: 2 ** 16, r: 8, p: 1 };

const MAX_COST: ScryptCost = { N: 2 ** 17, r: 16, p: 2 };

const logger = new Logger('Password');

const costParameter = (max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().max(max));

const storedHashSchema = z
  .string()
  .transform((value) => value.split('$'))
  .pipe(
    z.tuple([
      z.literal(ALGORITHM),
      costParameter(MAX_COST.N),
      costParameter(MAX_COST.r),
      costParameter(MAX_COST.p),
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
    logger.error('A stored password hash has an unknown format or an unsafe cost');
    return false;
  }

  const { cost, salt, key } = result.data;
  const candidate = await deriveKey(password, salt, cost);

  return candidate.length === key.length && timingSafeEqual(candidate, key);
}
