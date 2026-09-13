export interface ParsedReviewNumber {
  year: number;
  sequence: number;
}

export function parseReviewNumber(reviewNo: string): ParsedReviewNumber | null {
  const match = /^REV-(\d{4})-(\d{6})$/.exec(reviewNo);
  if (!match) return null;
  return {
    year: Number(match[1]),
    sequence: Number(match[2]),
  };
}

export function formatReviewNumber(year: number, sequence: number): string {
  return `REV-${year}-${String(sequence).padStart(6, '0')}`;
}

export function nextReviewNumber(currentMax: string | null, year: number): string {
  const seq = currentMax ? (parseReviewNumber(currentMax)?.sequence ?? 0) : 0;
  return formatReviewNumber(year, seq + 1);
}
