import type {
  MetadataOptionDto,
  MetadataOptionsDto,
  ReviewMetadataCodeDto,
  ReviewMetadataDto,
  ReviewMetadataMaterialDto,
} from './types';

export const METADATA_OPTION_TYPES = [
  'MATERIAL',
  'PROCESS',
  'PROBLEM_DOMAIN',
  'PROBLEM_SYMPTOM',
] as const;

export const METADATA_MISSING_DIMENSION_WHITELIST = [
  'PROBLEM_DOMAIN',
  'PRIMARY_MATERIAL',
  'PROCESS',
] as const;

export const METADATA_MISSING_DIMENSION_LABELS: Record<string, string> = {
  PROBLEM_DOMAIN: '请至少选择一个“问题环节”',
  PRIMARY_MATERIAL: '请选择“主要材质”',
  PROCESS: '当前问题环节要求至少选择一种“工艺”',
};

const MATERIAL_DISPLAY_LABELS: Record<string, string> = {
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

export interface MetadataOptionDbRow {
  org_id: string | null;
  dict_type: string;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_system: boolean;
  enabled: boolean;
}

export interface ReviewMetadataRow {
  material_other_text: string | null;
  process_other_text: string | null;
  problem_domain_other_text: string | null;
  problem_symptom_other_text: string | null;
}

export interface ReviewMetadataItemRow {
  metadata_type: string;
  is_primary: boolean;
  code: string;
  label: string;
}

export function canReadMetadataOptions(profile: { id: string; org_id: string } | null): boolean {
  return profile !== null;
}

function getDisplayLabel(type: string, code: string, fallback: string): string {
  if (type === 'MATERIAL') {
    return MATERIAL_DISPLAY_LABELS[code] ?? fallback;
  }
  return fallback;
}

function toOptionDto(row: MetadataOptionDbRow): MetadataOptionDto {
  return {
    code: row.code,
    label: getDisplayLabel(row.dict_type, row.code, row.label),
    description: row.description,
    sortOrder: row.sort_order,
  };
}

export function buildMetadataOptionsDto(rows: MetadataOptionDbRow[]): MetadataOptionsDto {
  const valid = rows.filter(
    row =>
      row.org_id === null
      && row.is_system === true
      && row.enabled === true
      && (METADATA_OPTION_TYPES as readonly string[]).includes(row.dict_type),
  );
  const sorted = [...valid].sort(
    (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code),
  );

  return {
    materials: sorted.filter(row => row.dict_type === 'MATERIAL').map(toOptionDto),
    processes: sorted.filter(row => row.dict_type === 'PROCESS').map(toOptionDto),
    problemDomains: sorted.filter(row => row.dict_type === 'PROBLEM_DOMAIN').map(toOptionDto),
    problemSymptoms: sorted.filter(row => row.dict_type === 'PROBLEM_SYMPTOM').map(toOptionDto),
  };
}

function toCodeDto(row: ReviewMetadataItemRow): ReviewMetadataCodeDto {
  return {
    code: row.code,
    label: getDisplayLabel(row.metadata_type, row.code, row.label),
  };
}

export function buildReviewMetadataDto(params: {
  metadataRow: ReviewMetadataRow | null;
  items: ReviewMetadataItemRow[];
}): ReviewMetadataDto | null {
  const { metadataRow, items } = params;
  if (!metadataRow) return null;

  const materials: ReviewMetadataMaterialDto[] = items
    .filter(item => item.metadata_type === 'MATERIAL')
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.code.localeCompare(b.code))
    .map(item => ({
      code: item.code,
      label: getDisplayLabel(item.metadata_type, item.code, item.label),
      isPrimary: item.is_primary,
    }));

  const processes = items
    .filter(item => item.metadata_type === 'PROCESS')
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(toCodeDto);

  const problemDomains = items
    .filter(item => item.metadata_type === 'PROBLEM_DOMAIN')
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(toCodeDto);

  const problemSymptoms = items
    .filter(item => item.metadata_type === 'PROBLEM_SYMPTOM')
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(toCodeDto);

  return {
    materials,
    processes,
    problemDomains,
    problemSymptoms,
    materialOtherText: metadataRow.material_other_text,
    processOtherText: metadataRow.process_other_text,
    problemDomainOtherText: metadataRow.problem_domain_other_text,
    problemSymptomOtherText: metadataRow.problem_symptom_other_text,
  };
}

export function sanitizeMissingDimensions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const dimension of value) {
    if (
      typeof dimension === 'string'
      && (METADATA_MISSING_DIMENSION_WHITELIST as readonly string[]).includes(dimension)
      && !seen.has(dimension)
    ) {
      seen.add(dimension);
      result.push(dimension);
    }
  }
  return result;
}

export function missingDimensionLabel(code: string): string {
  return METADATA_MISSING_DIMENSION_LABELS[code] ?? code;
}

export function buildMissingDimensionsQuery(values: string[]): string {
  return sanitizeMissingDimensions(values).join(',');
}
