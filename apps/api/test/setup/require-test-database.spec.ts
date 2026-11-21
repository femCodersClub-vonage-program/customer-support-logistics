import { describe, expect, it } from 'vitest';

import { assertTestDatabaseUrl } from './require-test-database.js';

describe('assertTestDatabaseUrl', () => {
  it('rejects a missing DATABASE_URL', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/need an explicit DATABASE_URL/);
  });

  it('rejects an empty DATABASE_URL', () => {
    expect(() => assertTestDatabaseUrl('')).toThrow(/need an explicit DATABASE_URL/);
  });

  it('rejects the development database', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://app:secret@localhost:5432/customer_support_logistics'),
    ).toThrow(/"customer_support_logistics" doesn't look like a test database/);
  });

  it('rejects a database whose name only contains _test', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://app:secret@localhost:5432/my_test_data'),
    ).toThrow(/doesn't look like a test database/);
  });

  it('rejects a URL without a database name', () => {
    expect(() => assertTestDatabaseUrl('postgresql://app:secret@localhost:5432')).toThrow(
      /doesn't look like a test database/,
    );
  });

  it('rejects a value that is not a URL', () => {
    expect(() => assertTestDatabaseUrl('customer_support_logistics_test')).toThrow(
      /not a valid URL/,
    );
  });

  it('never shows the password in the error', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://app:secret@localhost:5432/customer_support_logistics'),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining('secret') }));
  });

  it('accepts a database whose name ends in _test', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://app:secret@localhost:5432/customer_support_logistics_test?sslmode=disable',
      ),
    ).not.toThrow();
  });
});
