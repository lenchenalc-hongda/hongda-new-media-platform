// ===== Review Center Phase 1 Unit Tests =====
import {
  parseReviewNumber,
  formatReviewNumber,
  nextReviewNumber,
} from '../../src/lib/review-center/review-number';
import {
  createDraftSchema,
  listQuerySchema,
  reviewIdSchema,
} from '../../src/lib/review-center/schemas';
import {
  reviewStatusLabel,
  riskLevelLabel,
  formatReviewDate,
  formatReviewDateTime,
} from '../../src/lib/review-center/formatters';
import { canCreateReview } from '../../src/lib/review-center/permissions';
import { normalizeSearchQuery } from '../../src/lib/review-center/search';
import { parseFeatureFlag } from '../../src/lib/features';
import { PORTAL_GROUPS } from '../../src/lib/constants/navigation';
import { applyCreateVisibility } from '../../src/lib/review-center/navigation';
import {
  createDraftReview,
  getReviewDetail,
  listReviewCases,
  ReviewServiceError,
} from '../../src/lib/review-center/service';

var passed = 0;
var failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

console.log('\n=== Review Center Phase 1 ===');

// Review number
const parsed = parseReviewNumber('REV-2026-000123');
assert(parsed?.year === 2026 && parsed?.sequence === 123, 'parse review number');
assert(parseReviewNumber('REV-26-000123') === null, 'reject invalid review number');
assert(formatReviewNumber(2026, 7) === 'REV-2026-000007', 'format review number padding');
assert(nextReviewNumber(null, 2026) === 'REV-2026-000001', 'next review number from empty');
assert(nextReviewNumber('REV-2026-000042', 2026) === 'REV-2026-000043', 'next review number from max');

// Create schema
const validDraft = createDraftSchema.parse({
  review_type: 'A',
  title: '  测试标题  ',
  customer_name: '  客户A  ',
  description: '',
  impact_summary: '影响',
});
assert(validDraft.title === '测试标题', 'create schema trims title');
assert(validDraft.customer_name === '客户A', 'create schema trims customer');
assert(validDraft.description === null, 'create schema empty text -> null');
assert(validDraft.review_type === 'A', 'create schema type A');
assert(createDraftSchema.safeParse({ review_type: 'B', title: 'x' }).success, 'create schema type B');
assert(createDraftSchema.safeParse({ review_type: 'C', title: 'x' }).success, 'create schema type C');

const systemFieldRejected = !createDraftSchema.safeParse({
  review_type: 'A',
  title: 'x',
  org_id: '00000000-0000-0000-0000-000000000000',
}).success;
const createdByRejected = !createDraftSchema.safeParse({
  review_type: 'A',
  title: 'x',
  created_by: '00000000-0000-0000-0000-000000000000',
}).success;
const statusRejected = !createDraftSchema.safeParse({
  review_type: 'A',
  title: 'x',
  status: 'closed',
}).success;
const versionRejected = !createDraftSchema.safeParse({
  review_type: 'A',
  title: 'x',
  version: 2,
}).success;
assert(systemFieldRejected, 'create schema rejects org_id');
assert(createdByRejected, 'create schema rejects created_by');
assert(statusRejected, 'create schema rejects status');
assert(versionRejected, 'create schema rejects version');

// List query schema
const listParsed = listQuerySchema.parse({ page: '2', limit: '30', q: '  PE  ' });
assert(listParsed.page === 2 && listParsed.limit === 30, 'list query coerces numbers');
assert(listParsed.q === 'PE', 'list query trims q');
assert(!listQuerySchema.safeParse({ limit: 101 }).success, 'list query rejects limit > 100');

// Route id schema
assert(reviewIdSchema.safeParse({ id: '00000000-0000-0000-0000-000000000000' }).success, 'route id uuid');
assert(!reviewIdSchema.safeParse({ id: 'abc' }).success, 'route id rejects non-uuid');

// Formatters
assert(reviewStatusLabel('draft') === '草稿', 'status label draft');
assert(reviewStatusLabel('closed') === '已关闭', 'status label closed');
assert(riskLevelLabel('RED') === '高', 'risk label red');
assert(riskLevelLabel(null) === '未评级', 'risk label null');

// Viewer create handling
assert(canCreateReview('viewer') === false, 'viewer cannot create review');
assert(canCreateReview('admin') === true, 'admin can create review');
assert(canCreateReview('sales') === true, 'sales can create review');

// Feature flag parsing
assert(parseFeatureFlag('true') === true, 'feature flag true');
assert(parseFeatureFlag('1') === true, 'feature flag 1');
assert(parseFeatureFlag('false') === false, 'feature flag false');
assert(parseFeatureFlag(undefined) === false, 'feature flag missing');

// Role-based navigation visibility
const viewerGroups = applyCreateVisibility(PORTAL_GROUPS, false);
const viewerReview = viewerGroups.find(g => g.id === 'review')!;
assert(viewerReview.items.length === 9, 'viewer review portal has 9 items');
assert(
  !viewerReview.items.some(i => i.path === '/review-center/new'),
  'viewer review portal hides new review',
);
assert(
  viewerGroups.reduce((sum, g) => sum + g.items.length, 0) === 38,
  'viewer total visible modules 38',
);

const adminGroups = applyCreateVisibility(PORTAL_GROUPS, true);
const adminReview = adminGroups.find(g => g.id === 'review')!;
assert(adminReview.items.length === 10, 'admin review portal has 10 items');
assert(
  adminReview.items.some(i => i.path === '/review-center/new'),
  'admin review portal shows new review',
);
assert(
  adminGroups.reduce((sum, g) => sum + g.items.length, 0) === 39,
  'admin total visible modules 39',
);

function chainableResult(result: any) {
  const obj: any = {};
  ['select', 'eq', 'like', 'order', 'limit', 'range', 'or'].forEach(m => {
    obj[m] = () => obj;
  });
  obj.then = (resolve: any) => resolve(result);
  obj.maybeSingle = () => Promise.resolve(result);
  return obj;
}

function createFakeCreateClient(results: string[]) {
  const calls = { inserts: 0 };
  const rc: any = {
    select: () => chainableResult({ data: [], error: null }),
    insert: () => ({
      select: () => ({
        maybeSingle: async () => {
          calls.inserts++;
          const result = results[calls.inserts - 1];
          if (result === '23505') return { data: null, error: { code: '23505' } };
          if (result === 'other') return { data: null, error: { code: 'PGRST301' } };
          return { data: { id: 'r1', review_no: 'REV-2026-000001' }, error: null };
        },
      }),
    }),
  };
  return {
    calls,
    from: () => rc,
  };
}

async function runServiceTests() {
  // System fields strict rejection
  const systemFields = [
    'owner_id',
    'closed_at',
    'closed_by',
    'archived_at',
    'created_at',
  ];
  for (const field of systemFields) {
    assert(
      !createDraftSchema.safeParse({
        review_type: 'A',
        title: 'x',
        [field]: '00000000-0000-0000-0000-000000000000',
      }).success,
      'create schema rejects ' + field,
    );
  }

  // q normalization
  assert(normalizeSearchQuery('  PE  ') === 'PE', 'q normalization trims spaces');
  assert(
    normalizeSearchQuery('a,b(c)%d_"e\\') === 'a b c d e',
    'q normalization removes filter metacharacters',
  );
  assert(normalizeSearchQuery(',') === undefined, 'q normalization empty after filter');

  // page/limit bounds
  assert(!listQuerySchema.safeParse({ page: 0 }).success, 'list query rejects page 0');
  assert(!listQuerySchema.safeParse({ limit: 0 }).success, 'list query rejects limit 0');
  assert(!listQuerySchema.safeParse({ limit: 101 }).success, 'list query rejects limit > 100');
  assert(
    !listQuerySchema.safeParse({ q: 'x'.repeat(101) }).success,
    'list query rejects q > 100',
  );

  // Stable sort
  const orders: any[] = [];
  const listBuilder: any = {
    select: () => listBuilder,
    eq: () => listBuilder,
    or: () => listBuilder,
    range: () => listBuilder,
    order: (col: any, opts: any) => {
      orders.push([col, opts]);
      return listBuilder;
    },
    then: (resolve: any) => resolve({ data: [], error: null, count: 0 }),
  };
  const listClient = { from: () => listBuilder };
  await listReviewCases(listClient, 'org', { page: 1, limit: 20 });
  assert(
    orders.length === 2
      && orders[0][0] === 'created_at'
      && orders[0][1].ascending === false,
    'stable sort created_at desc',
  );
  assert(
    orders[1][0] === 'id' && orders[1][1].ascending === false,
    'stable sort id desc',
  );

  // Detail not found -> 404
  const detailClient: any = {
    from: () => ({
      select: () => chainableResult({ data: null, error: null }),
    }),
  };
  let detailError: any = null;
  try {
    await getReviewDetail(detailClient, 'org', '00000000-0000-0000-0000-000000000000');
  } catch (e: any) {
    detailError = e;
  }
  assert(
    detailError instanceof ReviewServiceError && detailError.status === 404,
    'detail not found -> 404',
  );

  // Unique conflict retry
  const retryClient = createFakeCreateClient(['23505', 'ok']);
  const created = await createDraftReview(retryClient, 'org', 'profile', {
    review_type: 'A',
    title: 'x',
  });
  assert(retryClient.calls.inserts === 2, 'unique conflict retried once');
  assert(created.id === 'r1', 'retry returns created review');

  // Non-unique error does not retry
  const errorClient = createFakeCreateClient(['other']);
  let createError: any = null;
  try {
    await createDraftReview(errorClient, 'org', 'profile', {
      review_type: 'A',
      title: 'x',
    });
  } catch (e: any) {
    createError = e;
  }
  assert(
    createError instanceof ReviewServiceError && createError.status === 500,
    'non-unique DB error no retry',
  );
  assert(errorClient.calls.inserts === 1, 'non-unique error insert count 1');

  // Date formatter
  const localDate = new Date(2026, 7, 18, 9, 15);
  assert(formatReviewDate(localDate.toISOString()) === '2026-08-18', 'review date format');
  assert(
    formatReviewDateTime(localDate.toISOString()) === '2026-08-18 09:15',
    'review datetime format',
  );
}

runServiceTests().then(() => {
  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
}).catch(err => {
  console.error('Review Center tests crashed:', String(err?.message || err));
  process.exit(1);
});
