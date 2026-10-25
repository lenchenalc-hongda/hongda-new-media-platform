/**
 * CPC actual customer value grading, based ONLY on finance-confirmed
 * net receipts in CNY cents across the approved last-12-month period.
 *
 * This function does not fetch receipts, infer transaction validity,
 * modify the workshop customer pool, or assign a potential grade.
 * An ungraded/unaudited financial source must remain N, never zero.
 */
export const CUSTOMER_ACTUAL_GRADES = ['SS', 'S', 'A', 'B', 'C', 'D', 'N'] as const;

export type CustomerActualGrade = (typeof CUSTOMER_ACTUAL_GRADES)[number];

export type CustomerActualRatingInput =
  | { financeDataState: 'ungraded' }
  | { financeDataState: 'verified'; netReceiptsCnyFen: number };

export const CUSTOMER_ACTUAL_GRADE_CUTOFFS_CNY_FEN = {
  SS_EXCLUSIVE: 300_000_000, // > 300 wan CNY
  S_EXCLUSIVE: 100_000_000,  // > 100 wan CNY
  A_INCLUSIVE: 50_000_000,  // >= 50 wan CNY
  B_INCLUSIVE: 10_000_000,  // >= 10 wan CNY
  C_INCLUSIVE: 1_000_000,   // >= 1 wan CNY
} as const;

/**
 * Boundary semantics approved by the owner:
 * >300万 SS; >100万–300万 S; 50万–100万 A;
 * 10万–<50万 B; 1万–<10万 C; <1万 D; not graded N.
 */
export function classifyCustomerActualGrade(
  input: CustomerActualRatingInput,
): CustomerActualGrade {
  if (input.financeDataState === 'ungraded') return 'N';

  const cents = input.netReceiptsCnyFen;
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('Verified customer net receipts must be integer CNY cents');
  }

  const cutoff = CUSTOMER_ACTUAL_GRADE_CUTOFFS_CNY_FEN;
  if (cents > cutoff.SS_EXCLUSIVE) return 'SS';
  if (cents > cutoff.S_EXCLUSIVE) return 'S';
  if (cents >= cutoff.A_INCLUSIVE) return 'A';
  if (cents >= cutoff.B_INCLUSIVE) return 'B';
  if (cents >= cutoff.C_INCLUSIVE) return 'C';
  return 'D';
}
