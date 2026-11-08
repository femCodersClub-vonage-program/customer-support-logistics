import type * as schema from './schema/index.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export const DATABASE = Symbol('DATABASE');

export const DATABASE_POOL = Symbol('DATABASE_POOL');

export type Database = NodePgDatabase<typeof schema>;
