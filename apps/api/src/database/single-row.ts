export function singleRow<T>(rows: readonly T[]): T {
  const [row] = rows;

  if (row === undefined || rows.length > 1) {
    throw new Error(`Expected exactly one row, got ${rows.length}`);
  }

  return row;
}
