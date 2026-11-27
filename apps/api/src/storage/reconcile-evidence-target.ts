import { parseArgs } from 'node:util';

import { Client } from 'pg';

export function shouldApplyReconciliation(
  args: string[],
  databaseUrl: string,
  bucket: string,
): boolean {
  const { values } = parseArgs({
    args,
    options: {
      apply: { type: 'boolean' },
      'expect-database': { type: 'string' },
      'expect-bucket': { type: 'string' },
    },
  });
  if (!values.apply) return false;

  const { host, port, database } = new Client({ connectionString: databaseUrl });
  const target = `${host}:${port}/${database}`;
  if (!database || values['expect-database'] !== target || values['expect-bucket'] !== bucket) {
    throw new Error(
      'Deletion requires --expect-database=<host:port/database> and --expect-bucket=<bucket> matching the configured target.',
    );
  }
  return true;
}
