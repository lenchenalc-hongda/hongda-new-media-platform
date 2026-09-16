const MATERIAL_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  PP: 'PP',
  PE: 'PE',
  ABS: 'ABS',
  PS: 'PS',
  PET: 'PET',
  PETG: 'PETG',
  PC: 'PC',
  PVC: 'PVC',
  SILICONE: '硅胶',
  METAL: '金属',
  GLASS: '玻璃',
  CERAMIC: '陶瓷',
  WOOD: '木材',
  LEATHER: '皮革',
  PAPER: '纸类',
  OTHER: '其他',
};

function getMappedLabel(code: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(MATERIAL_DISPLAY_LABELS, code)
    ? MATERIAL_DISPLAY_LABELS[code]
    : undefined;
}

export function getMaterialDisplayLabel(
  code: string | null | undefined,
  fallbackLabel: string | null | undefined,
): string {
  const fallback = typeof fallbackLabel === 'string' ? fallbackLabel : '';
  if (typeof code !== 'string') return fallback;
  return getMappedLabel(code)
    ?? getMappedLabel(code.trim().toUpperCase())
    ?? fallback;
}
