import { and, eq } from 'drizzle-orm';

import { evidence, incidents } from '../database/schema/index.js';

import type { StorageService } from './storage.service.js';
import type { Database } from '../database/database.constants.js';

// Completion holds the same incident lock from before CopyObject through COMMIT.
// After acquiring it, an unreferenced final key cannot become ready later.
export async function reconcileEvidence(db: Database, storage: StorageService): Promise<number> {
  let deleted = 0;
  for await (const key of storage.listKeys('incidents/')) {
    const match =
      /^incidents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(?:ready\/)?[^/]+$/i.exec(
        key,
      );
    if (!match) continue;
    await db.transaction(async (tx) => {
      await tx
        .select({ id: incidents.id })
        .from(incidents)
        .where(eq(incidents.id, match[1]!))
        .for('update');
      const [row] = await tx
        .select({ id: evidence.id })
        .from(evidence)
        .where(and(eq(evidence.storageKey, key), eq(evidence.status, 'ready')));
      if (row) return;
      await storage.deleteObject(key);
      deleted++;
    });
  }
  return deleted;
}
