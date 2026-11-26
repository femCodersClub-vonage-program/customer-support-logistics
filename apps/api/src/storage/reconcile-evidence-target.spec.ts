import { describe, expect, it } from 'vitest';

import { shouldApplyReconciliation } from './reconcile-evidence-target.js';

const database = 'postgresql://app:password@localhost:5433/customer_support_logistics';
const confirmed = [
  '--apply',
  '--expect-database=localhost:5433/customer_support_logistics',
  '--expect-bucket=evidence',
];

describe('reconciliation target confirmation', () => {
  it('defaults to preview and requires explicit deletion with a matching target', () => {
    expect(shouldApplyReconciliation([], database, 'evidence')).toBe(false);
    expect(shouldApplyReconciliation(confirmed.slice(1), database, 'evidence')).toBe(false);
    expect(() => shouldApplyReconciliation(['--apply'], database, 'evidence')).toThrow(
      /matching the configured target/,
    );
    expect(shouldApplyReconciliation(confirmed, database, 'evidence')).toBe(true);
  });

  it('rejects an inherited test database or a different bucket', () => {
    expect(() => shouldApplyReconciliation(confirmed, `${database}_test`, 'evidence')).toThrow(
      /matching the configured target/,
    );
    expect(() => shouldApplyReconciliation(confirmed, `${database}?port=5434`, 'evidence')).toThrow(
      /matching the configured target/,
    );
    expect(() => shouldApplyReconciliation(confirmed, database, 'evidence-other')).toThrow(
      /matching the configured target/,
    );
  });
});
