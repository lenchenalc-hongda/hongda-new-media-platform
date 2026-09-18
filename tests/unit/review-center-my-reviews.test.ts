import fs from 'node:fs';
import { register } from 'node:module';
import { NextRequest } from 'next/server';
import {
  listMyReviewCases,
  listReviewCases,
} from '../../src/lib/review-center/service';

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

function reviewRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    org_id: 'org-1',
    review_no: `REV-2026-${id.padStart(6, '0')}`,
    review_type: 'A',
    title: `复盘 ${id}`,
    status: 'draft',
    risk_level: null,
    customer_name: null,
    order_no: null,
    project_name: null,
    product_name: null,
    created_by: null,
    owner_id: null,
    pmo_id: null,
    occurred_at: null,
    created_at: `2026-09-01T00:00:${id.padStart(2, '0')}Z`,
    updated_at: `2026-09-01T00:00:${id.padStart(2, '0')}Z`,
    ...overrides,
  };
}

function createMineClient(
  rows: Array<Record<string, any>>,
  members: Array<{ org_id: string; profile_id: string; review_id: string }> = [],
) {
  const calls: Array<{ table: string; operations: Array<[string, ...any[]]> }> = [];

  function builder(table: string) {
    const operations: Array<[string, ...any[]]> = [];
    let directProfileId: string | null = null;
    let inIds: string[] | null = null;
    let range: [number, number] | null = null;
    const conditions = new Map<string, unknown>();

    const chain: any = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        operations.push(['eq', column, value]);
        conditions.set(column, value);
        return chain;
      },
      or: (expression: string) => {
        operations.push(['or', expression]);
        const directMatch = expression.match(/created_by\.eq\.([^,]+)/);
        if (directMatch) directProfileId = directMatch[1];
        const searchMatch = expression.match(/title\.ilike\.%([^%]+)%/);
        if (searchMatch) conditions.set('q_like', searchMatch[1]);
        return chain;
      },
      in: (column: string, values: string[]) => {
        operations.push(['in', column, values]);
        if (column === 'id') inIds = values;
        return chain;
      },
      order: (column: string, options: unknown) => {
        operations.push(['order', column, options]);
        return chain;
      },
      range: (from: number, to: number) => {
        operations.push(['range', from, to]);
        range = [from, to];
        return chain;
      },
      then: (resolve: (value: unknown) => unknown) => {
        let data: unknown[] = [];
        let count = 0;

        if (table === 'profiles') {
          count = 1;
          data = [{ id: 'profile-A', org_id: 'org-1' }];
        } else if (table === 'review_members') {
          const filtered = members.filter(row =>
            row.org_id === conditions.get('org_id')
            && row.profile_id === conditions.get('profile_id'),
          );
          count = filtered.length;
          data = range ? filtered.slice(range[0], range[1] + 1) : filtered;
        } else {
          let filtered = rows.filter(row => row.org_id === conditions.get('org_id'));
          if (inIds) {
            const idSet = new Set(inIds);
            filtered = filtered.filter(row => idSet.has(row.id));
          } else if (directProfileId) {
            filtered = filtered.filter(row =>
              row.created_by === directProfileId
              || row.owner_id === directProfileId
              || row.pmo_id === directProfileId,
            );
          }
          const status = conditions.get('status');
          if (status) filtered = filtered.filter(row => row.status === status);
          const reviewType = conditions.get('review_type');
          if (reviewType) filtered = filtered.filter(row => row.review_type === reviewType);
          const riskLevel = conditions.get('risk_level');
          if (riskLevel) filtered = filtered.filter(row => row.risk_level === riskLevel);
          const q = conditions.get('q_like') as string | undefined;
          if (q) {
            const needle = q.toLowerCase();
            filtered = filtered.filter(row =>
              [
                row.review_no,
                row.title,
                row.customer_name,
                row.order_no,
                row.project_name,
                row.product_name,
              ].some(value => typeof value === 'string' && value.toLowerCase().includes(needle)),
            );
          }
          filtered.sort((left, right) =>
            String(right.created_at).localeCompare(String(left.created_at))
            || String(right.id).localeCompare(String(left.id)),
          );
          count = filtered.length;
          data = range ? filtered.slice(range[0], range[1] + 1) : filtered;
        }
        return Promise.resolve(resolve({ data, error: null, count }));
      },
    };
    chain.maybeSingle = async () => {
      const result: any = await new Promise(resolve => chain.then(resolve));
      return {
        data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
        error: result.error,
      };
    };

    return chain;
  }

  return {
    calls,
    client: {
      from(table: string) {
        const chain = builder(table);
        const originalOr = chain.or;
        chain.or = (expression: string) => {
          const operations = (calls.find(call => call.table === table)?.operations) || [];
          if (calls.length === 0 || calls[calls.length - 1].table !== table) {
            calls.push({ table, operations: [] });
          }
          const current = calls[calls.length - 1].operations;
          current.push(['or', expression]);
          return originalOr(expression);
        };
        const originalEq = chain.eq;
        chain.eq = (column: string, value: unknown) => {
          if (calls.length === 0 || calls[calls.length - 1].table !== table) {
            calls.push({ table, operations: [] });
          }
          calls[calls.length - 1].operations.push(['eq', column, value]);
          return originalEq(column, value);
        };
        calls.push({ table, operations: [] });
        return chain;
      },
    },
  };
}

console.log('\n=== Review Center My Reviews ===');

const rows = [
  reviewRow('1', { created_by: 'A', owner_id: 'A' }),
  reviewRow('2', { created_by: 'A', owner_id: 'B' }),
  reviewRow('3', { pmo_id: 'A' }),
  reviewRow('4', { title: 'PE 项目' }),
  reviewRow('5', { created_by: 'C', owner_id: 'C' }),
  reviewRow('6', { owner_id: 'A', status: 'submitted' }),
  reviewRow('7', { owner_id: 'B', status: 'submitted', title: 'PE submitted' }),
];
const members = [{ org_id: 'org-1', profile_id: 'A', review_id: '4' }];

const { client, calls } = createMineClient(rows, members);
const mineA = await listMyReviewCases(client, 'org-1', 'A', {
  scope: 'mine',
  page: 1,
  limit: 20,
});
assert(mineA.items.some(item => item.id === '1'), 'created_by owner included');
assert(mineA.items.some(item => item.id === '4'), 'member relation included');
assert(mineA.items.some(item => item.id === '6'), 'submitted remains in mine');
assert(!mineA.items.some(item => item.id === '5'), 'unrelated review excluded');
assert(new Set(mineA.items.map(item => item.id)).size === mineA.items.length, 'mine rows are deduplicated');

const mineB = await listMyReviewCases(client, 'org-1', 'B', {
  scope: 'mine',
  page: 1,
  limit: 20,
});
assert(mineB.items.some(item => item.id === '2'), 'owner relation included');

const mineA2 = await listMyReviewCases(client, 'org-1', 'A', {
  scope: 'mine',
  page: 1,
  limit: 20,
});
assert(mineA2.items.some(item => item.id === '3'), 'pmo relation included');
assert(mineA2.total === mineA2.items.length, 'mine count matches merged rows');

const duplicateRows = [
  reviewRow('8', { owner_id: 'A', created_by: 'A' }),
];
const duplicateClient = createMineClient(
  duplicateRows,
  [{ org_id: 'org-1', profile_id: 'A', review_id: '8' }],
).client;
const duplicate = await listMyReviewCases(duplicateClient, 'org-1', 'A', {
  scope: 'mine', page: 1, limit: 20,
});
assert(duplicate.items.length === 1 && duplicate.total === 1, 'multi-relation review appears once');

const allStatuses = [
  'draft', 'submitted', 'in_review', 'action_required', 'verifying',
  'closed', 'archived', 'rejected', 'cancelled',
].map((status, index) => reviewRow(String(10 + index), { owner_id: 'A', status }));
const allStatusClient = createMineClient(allStatuses).client;
const allStatusResult = await listMyReviewCases(allStatusClient, 'org-1', 'A', {
  scope: 'mine', page: 1, limit: 50,
});
assert(allStatusResult.total === 9, 'mine does not filter lifecycle statuses');

const defaultList = await listReviewCases(client, 'org-1', { page: 1, limit: 20 });
assert(defaultList.total === rows.length, 'scope omitted keeps all reviews behavior');
const submittedQueue = await listReviewCases(client, 'org-1', {
  page: 1,
  limit: 20,
  status: 'submitted',
});
assert(
  submittedQueue.total === 2 && submittedQueue.items.every(item => item.status === 'submitted'),
  'approval queue submitted filter unchanged',
);

const filteredMine = await listMyReviewCases(client, 'org-1', 'A', {
  scope: 'mine',
  page: 1,
  limit: 20,
  q: 'PE',
});
assert(filteredMine.items.every(item => item.title?.includes('PE')), 'search combines with mine scope');

const statusMine = await listMyReviewCases(client, 'org-1', 'A', {
  scope: 'mine',
  page: 1,
  limit: 20,
  status: 'submitted',
});
assert(statusMine.items.every(item => item.status === 'submitted'), 'status combines with mine scope');

const pageRows = Array.from({ length: 5 }, (_, index) =>
  reviewRow(String(30 + index), { owner_id: 'A' }),
);
const pageClient = createMineClient(pageRows).client;
const pageOne = await listMyReviewCases(pageClient, 'org-1', 'A', {
  scope: 'mine', page: 1, limit: 2,
});
const pageThree = await listMyReviewCases(pageClient, 'org-1', 'A', {
  scope: 'mine', page: 3, limit: 2,
});
assert(pageOne.total === 5 && pageOne.items.length === 2, 'mine page count is correct');
assert(pageThree.items.length === 1, 'mine final page is correct');

assert(calls.some(call => call.table === 'review_members'), 'mine queries member relation');

const routeSource = fs.readFileSync('src/app/api/review-center/reviews/route.ts', 'utf8');
const minePageSource = fs.readFileSync('src/app/review-center/reviews/mine/page.tsx', 'utf8');
const workspaceSource = fs.readFileSync('src/components/review-center/ReviewListWorkspace.tsx', 'utf8');
assert(
  routeSource.includes("parsed.data.scope === 'mine'")
  && routeSource.includes('listMyReviewCases')
  && !routeSource.includes('searchParams.get(\'profileId\')'),
  'route uses server profile for mine scope',
);
assert(minePageSource.includes('scope="mine"'), 'mine page uses real mine workspace');
assert(workspaceSource.includes("params.set('scope', 'mine')"), 'mine page sends safe scope query');
assert(
  workspaceSource.includes("params.set('status', status)")
  && workspaceSource.includes("params.set('review_type', reviewType)")
  && workspaceSource.includes("params.set('risk_level', risk)")
  && workspaceSource.includes("params.set('q', appliedQ.trim())"),
  'mine page supports status type risk and search filters',
);

const routeLoader = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/auth/current-user.ts')) {
    return {
      format: 'module',
      source: \`
        export async function requireUserFromRequest() {
          return { id: 'auth-user-A' };
        }
        export async function requireRoleFromRequest() {
          return { id: 'auth-user-A' };
        }
      \`,
      shortCircuit: true,
    };
  }
  if (url.endsWith('/src/lib/supabase/server.ts')) {
    return {
      format: 'module',
      source: 'export async function createClient() { return globalThis.__myReviewsRouteClient; }',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
`;
await register('data:text/javascript,' + encodeURIComponent(routeLoader), import.meta.url);
const { GET: reviewsGet } = await import('../../src/app/api/review-center/reviews/route');

const routeFixtureHolder = createMineClient([
  reviewRow('1', { created_by: 'profile-A', owner_id: 'profile-A', status: 'draft' }),
]);
const routeFixture = routeFixtureHolder.client;
(globalThis as any).__myReviewsRouteClient = routeFixture;

const mineResponse = await reviewsGet(
  new NextRequest('http://localhost/api/review-center/reviews?scope=mine&status=draft'),
);
const mineBody = await mineResponse.json();
assert(mineResponse.status === 200, 'mine route returns 200');
assert(
  mineBody.items.length === 1
  && mineBody.items[0].id === '1'
  && mineBody.total === 1,
  'mine route uses authenticated server profile',
);

const allResponse = await reviewsGet(
  new NextRequest('http://localhost/api/review-center/reviews?status=submitted'),
);
assert(allResponse.status === 200, 'default route returns 200');
assert((await allResponse.json()).items.length === 0, 'default route preserves all scope and approval filter');

console.log(`My reviews tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
