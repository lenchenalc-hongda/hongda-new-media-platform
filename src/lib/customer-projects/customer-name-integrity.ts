/**
 * U+FFFD signals loss of original text during an earlier decoding step.
 * This guard is for writes/import preflights, NOT for filtering existing reads.
 */
const REPLACEMENT_CHARACTER = '\uFFFD';

export function hasCustomerNameEncodingDamage(value: unknown): boolean {
  return typeof value === 'string' && value.includes(REPLACEMENT_CHARACTER);
}

export function isUsableCustomerName(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && !hasCustomerNameEncodingDamage(value);
}

export function findInvalidCustomerNameRows(
  rows: readonly { displayNameSnapshot: unknown }[],
): number[] {
  const invalidIndexes: number[] = [];
  for (const [index, row] of rows.entries()) {
    if (!isUsableCustomerName(row.displayNameSnapshot)) {
      invalidIndexes.push(index);
    }
  }
  return invalidIndexes;
}
