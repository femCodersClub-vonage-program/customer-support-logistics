const TEST_DATABASE_SUFFIX = '_test';
const EXAMPLE_URL =
  'postgresql://app:dev_only_password@localhost:5432/customer_support_logistics_test';
const HOW_TO_FIX = `Set DATABASE_URL to a database whose name ends in "${TEST_DATABASE_SUFFIX}", for example:\n  DATABASE_URL=${EXAMPLE_URL}\napps/api/README.md#test-database explains how to create and migrate it.`;

export function setup(): void {
  assertTestDatabaseUrl(process.env.DATABASE_URL);
}

export function assertTestDatabaseUrl(url: string | undefined): void {
  if (!url) {
    throw new Error(
      `The e2e tests empty the database, so they need an explicit DATABASE_URL.\n${HOW_TO_FIX}`,
    );
  }

  const databaseName = databaseNameOf(url);

  if (!databaseName.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `The e2e tests empty the database, and "${databaseName}" doesn't look like a test database.\n${HOW_TO_FIX}`,
    );
  }
}

function databaseNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL.\n${HOW_TO_FIX}`);
  }
}
