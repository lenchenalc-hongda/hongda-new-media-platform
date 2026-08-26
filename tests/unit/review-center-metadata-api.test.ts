// ===== Review Center Metadata API Foundation Tests =====
import {
  buildMetadataOptionsDto,
  buildReviewMetadataDto,
  canReadMetadataOptions,
  sanitizeMissingDimensions,
  type MetadataOptionDbRow,
  type ReviewMetadataItemRow,
  type ReviewMetadataRow,
} from '../../src/lib/review-center/metadata';
import { metadataMutationSchema } from '../../src/lib/review-center/schemas';
import { mapReviewMutationResult } from '../../src/lib/review-center/mutation';
import { mapLifecycleRpcResult } from '../../src/lib/review-center/lifecycle-api';

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

function optionRow(overrides: Partial<MetadataOptionDbRow>): MetadataOptionDbRow {
  return {
    org_id: null,
    dict_type: 'MATERIAL',
    code: 'PP',
    label: '聚丙烯',
    description: '主要基材为 PP',
    sort_order: 1,
    is_system: true,
    enabled: true,
    ...overrides,
  };
}

function metadataRow(overrides: Partial<ReviewMetadataRow> = {}): ReviewMetadataRow {
  return {
    material_other_text: null,
    process_other_text: null,
    problem_domain_other_text: null,
    problem_symptom_other_text: null,
    ...overrides,
  };
}

function itemRow(overrides: Partial<ReviewMetadataItemRow>): ReviewMetadataItemRow {
  return {
    metadata_type: 'MATERIAL',
    is_primary: false,
    code: 'PP',
    label: '聚丙烯',
    ...overrides,
  };
}

console.log('\n=== Review Center Metadata API Foundation ===');

// Options DTO
const optionRows = [
  optionRow({ dict_type: 'MATERIAL', code: 'PP', sort_order: 1 }),
  optionRow({ dict_type: 'MATERIAL', code: 'PE', sort_order: 2 }),
  optionRow({ dict_type: 'PROCESS', code: 'HEAT_TRANSFER', sort_order: 3 }),
  optionRow({ dict_type: 'PROCESS', code: 'FILM_MAKING', sort_order: 1 }),
  optionRow({ dict_type: 'PROBLEM_DOMAIN', code: 'PROCESS', sort_order: 1 }),
  optionRow({ dict_type: 'PROBLEM_SYMPTOM', code: 'ADHESION_FAILURE', sort_order: 1 }),
  optionRow({ org_id: '00000000-0000-0000-0000-000000000001', code: 'ORG_CUSTOM' }),
  optionRow({ enabled: false, code: 'DISABLED' }),
  optionRow({ is_system: false, code: 'NOT_SYSTEM' }),
];
const options = buildMetadataOptionsDto(optionRows);
assert(options.materials.length === 2, 'options keeps only system enabled material rows');
assert(options.materials[0].code === 'PP', 'options sorts material by sort_order then code');
assert(options.processes.length === 2, 'options keeps valid process rows');
assert(options.problemDomains.length === 1, 'options keeps valid problem domains');
assert(options.problemSymptoms.length === 1, 'options keeps valid problem symptoms');
const materialKeys = Object.keys(options.materials[0]).sort();
assert(
  JSON.stringify(materialKeys) === JSON.stringify(['code', 'description', 'label', 'sortOrder']),
  'options DTO exposes only code,label,description,sortOrder',
);
assert(canReadMetadataOptions(null) === false, 'no profile cannot read options');
assert(
  canReadMetadataOptions({ id: '00000000-0000-0000-0000-000000000001', org_id: '00000000-0000-0000-0000-000000000002' }) === true,
  'active profile can read options',
);

// Detail DTO
assert(buildReviewMetadataDto({ metadataRow: null, items: [] }) === null, 'missing metadata row returns null');
const detail = buildReviewMetadataDto({
  metadataRow: metadataRow({
    material_other_text: '其他材质说明',
    problem_domain_other_text: '其他环节说明',
  }),
  items: [
    itemRow({ code: 'METAL', label: '金属', is_primary: true }),
    itemRow({ code: 'PP', label: '聚丙烯' }),
    itemRow({ metadata_type: 'PROCESS', code: 'HEAT_TRANSFER', label: '热转印' }),
    itemRow({ metadata_type: 'PROBLEM_DOMAIN', code: 'PROCESS', label: '工艺与参数' }),
    itemRow({ metadata_type: 'PROBLEM_SYMPTOM', code: 'ADHESION_FAILURE', label: '附着力不足/脱落' }),
  ],
});
assert(detail !== null, 'metadata row produces DTO');
if (detail) {
  assert(detail.materials.length === 2, 'detail keeps all materials');
  assert(detail.materials[0].code === 'METAL' && detail.materials[0].isPrimary === true, 'primary material first');
  assert(detail.processes[0].label === '热转印', 'detail process label resolved');
  assert(detail.problemDomains[0].label === '工艺与参数', 'detail domain label resolved');
  assert(detail.problemSymptoms[0].label === '附着力不足/脱落', 'detail symptom label resolved');
  assert(detail.materialOtherText === '其他材质说明', 'detail material other text preserved');
  assert(detail.problemDomainOtherText === '其他环节说明', 'detail domain other text preserved');
  assert(JSON.stringify(Object.keys(detail.materials[0]).sort()) === JSON.stringify(['code', 'isPrimary', 'label']), 'detail material no internal fields');
  assert(JSON.stringify(Object.keys(detail.processes[0]).sort()) === JSON.stringify(['code', 'label']), 'detail code no internal fields');
}

// Mutation schema
const validMutation = {
  expectedVersion: 1,
  materials: [{ code: 'PP', isPrimary: true }],
  processes: ['HEAT_TRANSFER'],
  problemDomains: ['PROCESS'],
  problemSymptoms: [],
  other: {
    materialOtherText: null,
    processOtherText: '',
    problemDomainOtherText: null,
    problemSymptomOtherText: null,
  },
};
assert(metadataMutationSchema.safeParse(validMutation).success === true, 'valid mutation accepted');
assert(
  metadataMutationSchema.safeParse({ ...validMutation, materials: [{ code: 'PP' }] }).success === false,
  'missing isPrimary rejected',
);
assert(
  metadataMutationSchema.safeParse({ ...validMutation, materials: [{ code: 'PP', isPrimary: 'true' }] }).success === false,
  'string isPrimary rejected',
);
assert(
  metadataMutationSchema.safeParse({ ...validMutation, materials: [{ code: 'PP', isPrimary: null }] }).success === false,
  'null isPrimary rejected',
);
assert(
  metadataMutationSchema.safeParse({ ...validMutation, materials: [{ code: 'PP', isPrimary: true, orgId: 'x' }] }).success === false,
  'material unknown key rejected',
);
assert(
  metadataMutationSchema.safeParse({ ...validMutation, orgId: 'x' }).success === false,
  'root unknown key rejected',
);
assert(
  metadataMutationSchema.safeParse({ ...validMutation, other: { ...validMutation.other, label: 'x' } }).success === false,
  'other unknown key rejected',
);
assert(
  metadataMutationSchema.safeParse({ ...validMutation, expectedVersion: 0 }).success === false,
  'invalid expectedVersion rejected',
);

// Mutation error mapping
function mutationError(code: string) {
  return mapReviewMutationResult({
    data: { ok: false, code, message: 'raw', data: null },
  });
}
assert(mutationError('FORBIDDEN').status === 403, 'FORBIDDEN maps to 403');
assert(mutationError('NOT_FOUND').status === 404, 'NOT_FOUND maps to 404');
assert(mutationError('VERSION_CONFLICT').status === 409, 'VERSION_CONFLICT maps to 409');
assert(mutationError('INVALID_TRANSITION').status === 409, 'INVALID_TRANSITION maps to 409');
assert(mutationError('INVALID_METADATA').status === 400, 'INVALID_METADATA maps to 400');
const unknownMutation = mutationError('UNKNOWN_DB_CODE');
assert(unknownMutation.status === 500, 'unknown mutation error maps to 500');
assert(unknownMutation.body.code === 'INTERNAL' && unknownMutation.body.message === '服务异常', 'unknown mutation error does not leak raw message');

// Lifecycle METADATA_INCOMPLETE mapping
const incomplete = mapLifecycleRpcResult('SUBMIT', {
  data: {
    ok: false,
    code: 'METADATA_INCOMPLETE',
    message: 'raw',
    data: {
      missingDimensions: [
        'PROBLEM_DOMAIN',
        'UNKNOWN',
        'PROBLEM_DOMAIN',
        'PRIMARY_MATERIAL',
        'PROCESS',
      ],
    },
  },
});
assert(incomplete.status === 422, 'METADATA_INCOMPLETE maps to 422');
assert(
  JSON.stringify((incomplete.body.data as Record<string, unknown>)?.missingDimensions) === JSON.stringify(['PROBLEM_DOMAIN', 'PRIMARY_MATERIAL', 'PROCESS']),
  'missingDimensions sanitized, deduped, ordered',
);
assert(
  JSON.stringify(sanitizeMissingDimensions(['X', 'PROCESS', 'PROCESS', 'PRIMARY_MATERIAL'])) === JSON.stringify(['PROCESS', 'PRIMARY_MATERIAL']),
  'sanitizeMissingDimensions handles unknown and duplicates',
);

// Lifecycle regression checks
const forbiddenLifecycle = mapLifecycleRpcResult('SUBMIT', {
  data: { ok: false, code: 'FORBIDDEN', message: 'raw', data: null },
});
assert(forbiddenLifecycle.status === 403, 'lifecycle FORBIDDEN regression 403');
const incompleteReview = mapLifecycleRpcResult('SUBMIT', {
  data: {
    ok: false,
    code: 'INCOMPLETE_REVIEW',
    message: 'raw',
    data: { missing_fields: ['title', 'UNKNOWN', 'title'] },
  },
});
assert(
  incompleteReview.status === 422
  && JSON.stringify((incompleteReview.body.data as Record<string, unknown>)?.missingFields) === JSON.stringify(['title']),
  'INCOMPLETE_REVIEW regression remains sanitized',
);

console.log(`Metadata API tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
