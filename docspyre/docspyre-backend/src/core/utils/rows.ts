/**
 * Helpers for Drizzle result arrays.
 *
 * `noUncheckedIndexedAccess` makes `const [row] = await db.insert(...)` yield
 * `T | undefined`. For writes that are expected to return a row, an absent row
 * is a genuine fault rather than a case to branch on, so it is surfaced loudly.
 */
export const requireRow = <T>(rows: T[], context: string): T => {
  const [row] = rows;
  if (!row) {
    throw new Error(`Expected ${context} to return a row, got none`);
  }
  return row;
};

/** First row or null, for reads where absence is a valid outcome. */
export const firstRow = <T>(rows: T[]): T | null => rows[0] ?? null;
