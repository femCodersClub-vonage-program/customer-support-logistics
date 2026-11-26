import { and, eq } from 'drizzle-orm';

import { evidence, incidents } from '../database/schema/index.js';

import type { StorageService } from './storage.service.js';
import type { Database } from '../database/database.constants.js';

async function hasReadyEvidence(db: Pick<Database, 'select'>, key: string): Promise<boolean> {
  const [row] = await db
    .select({ id: evidence.id })
    .from(evidence)
    .where(and(eq(evidence.storageKey, key), eq(evidence.status, 'ready')));
  return row !== undefined;
}

type ReconciliationMode =
  { mode: 'apply' } | { mode: 'preview'; onCandidate: (key: string) => void };

export async function reconcileEvidence(
  db: Database,
  storage: StorageService,
  options: ReconciliationMode,
): Promise<number> {
  let count = 0;
  for await (const key of storage.listKeys('incidents/')) {
    const match =
      /^incidents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/ready\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|heic|heif|mp4|mov)$/.exec(
        key,
      );
    if (!match) continue;
    if (await hasReadyEvidence(db, key)) continue;
    if (options.mode === 'preview') {
      options.onCandidate(key);
      count++;
      continue;
    }
    await db.transaction(async (tx) => {
      // Completion holds this lock from before CopyObject through COMMIT.
      await tx
        .select({ id: incidents.id })
        .from(incidents)
        .where(eq(incidents.id, match[1]!))
        .for('update');
      if (await hasReadyEvidence(tx, key)) return;
      await storage.deleteObject(key);
      count++;
    });
  }
  return count;
}