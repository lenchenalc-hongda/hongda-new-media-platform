import {
  buildMetadataOptionsDto,
  buildReviewMetadataDto,
  type MetadataOptionDbRow,
} from '../../src/lib/review-center/metadata';
import { getMaterialDisplayLabel } from '../../src/lib/review-center/material-labels';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

function optionRow(
  code: string,
  label: string,
  dictType = 'MATERIAL',
): MetadataOptionDbRow {
  return {
    org_id: null,
    dict_type: dictType,
    code,
    label,
    description: null,
    sort_order: 1,
    is_system: true,
    enabled: true,
  };
}

console.log('\n=== Review Center Material Labels ===');

const expectedLabels = [
  ['PP', '聚丙烯', 'PP'],
  ['PE', '聚乙烯', 'PE'],
  ['ABS', 'ABS 塑料', 'ABS'],
  ['PS', 'PS 塑料', 'PS'],
  ['PET', 'PET 聚酯', 'PET'],
  ['PETG', 'PETG 改性聚酯', 'PETG'],
  ['PC', 'PC 塑料', 'PC'],
  ['PVC', 'PVC 塑料', 'PVC'],
  ['SILICONE', '硅胶', '硅胶'],
  ['METAL', '金属', '金属'],
  ['GLASS', '玻璃', '玻璃'],
  ['CERAMIC', '陶瓷', '陶瓷'],
  ['WOOD', '木材', '木材'],
  ['LEATHER', '皮革', '皮革'],
  ['PAPER', '纸类', '纸类'],
  ['OTHER', '其他', '其他'],
] as const;

for (const [code, fallback, expected] of expectedLabels) {
  assert(
    getMaterialDisplayLabel(code, fallback) === expected,
    `${code} maps ${fallback} to ${expected}`,
  );
}

assert(
  getMaterialDisplayLabel('UNKNOWN', '未知材质') === '未知材质',
  'unknown material falls back to database label',
);
assert(
  getMaterialDisplayLabel('__proto__', '安全回退') === '安全回退',
  'object prototype key is not treated as a material',
);

const options = buildMetadataOptionsDto([
  ...expectedLabels.slice(0, 5).map(([code, label], index) => ({
    ...optionRow(code, label),
    sort_order: index + 1,
  })),
  optionRow('HEAT_TRANSFER', '热转印', 'PROCESS'),
]);

assert(
  options.materials.map(item => item.label).join('|') === 'PP|PE|ABS|PS|PET',
  'metadata options DTO maps material labels',
);
assert(options.processes[0].label === '热转印', 'PROCESS label remains unchanged');

const detail = buildReviewMetadataDto({
  metadataRow: {
    material_other_text: null,
    process_other_text: null,
    problem_domain_other_text: null,
    problem_symptom_other_text: null,
  },
  items: [
    {
      metadata_type: 'MATERIAL',
      is_primary: true,
      code: 'PETG',
      label: 'PETG 改性聚酯',
    },
    {
      metadata_type: 'PROCESS',
      is_primary: false,
      code: 'HEAT_TRANSFER',
      label: '热转印',
    },
  ],
});

assert(detail?.materials[0].label === 'PETG', 'review metadata DTO maps PETG');
assert(detail?.processes[0].label === '热转印', 'review metadata DTO keeps PROCESS label');

console.log(`Material label tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
