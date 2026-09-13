const FILTER_META_CHARS = /[,()%_"\\]/g;

export function normalizeSearchQuery(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .replace(FILTER_META_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return normalized.length > 0 ? normalized : undefined;
}
