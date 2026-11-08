import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE } from './database.constants.js';

import type { Database } from './database.constants.js';

export const DATABASE_CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class DatabaseHealth {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async isUp(timeoutMs = DATABASE_CHECK_TIMEOUT_MS): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Database check timed out')), timeoutMs);
    });

    try {
      await Promise.race([this.db.execute(sql`select 1`), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
