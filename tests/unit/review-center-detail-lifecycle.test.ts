// ===== Review Center Detail Lifecycle Integration Tests =====
import fs from 'node:fs';
import {
  applyLifecycleSuccessToDetail,
  type LifecycleSuccessData,
} from '../../src/lib/review-center/lifecycle-presentation';
import {
  TimelineSectionController,
  type TimelinePageFetchResult,
} from '../../src/lib/review-center/timeline-presentation';
import type { TimelineItemDTO } from '../../src/lib/review-center/timeline';
import { reviewStatusLabel } from '../../src/lib/review-center/formatters';
import type { ReviewDetail } from '../../src/lib/review-center/types';

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function tick() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

function makeItem(id: string): TimelineItemDTO {
  return {
    id,
    eventType: 'REVIEW_CREATED',
    actor: { displayName: '系统操作', role: null, isActive: null },
    details: {},
    createdAt: '2026-08-25T00:00:00Z',
  };
}

function pageResult(
  items: TimelineItemDTO[],
  hasMore = false,
  offset = 0,
  nextOffset: number | null = null,
): TimelinePageFetchResult {
  return {
    status: 200,
    ok: true,
    items,
    pageInfo: { limit: 30, offset, hasMore, nextOffset },
  };
}

function makeDetail(): ReviewDetail {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    org_id: 'org-1',
    review_no: 'REV-2026-000999',
    review_type: 'A',
    title: 'QA',
    status: 'draft',
    risk_level: 'GREEN',
    risk_reason: 'QA reason',
    occurred_at: '2026-08-25T00:00:00Z',
    customer_name: null,
    order_no: null,
    project_name: null,
    product_name: null,
    process_name: null,
    description: 'QA',
    impact_summary: null,
    created_by: 'creator-1',
    owner_id: 'owner-1',
    pmo_id: null,
    submitted_at: null,
    submitted_by_profile_id: null,
    closed_at: null,
    closed_by: null,
    close_override_reason: null,
    report_generated_at: null,
    archived_at: null,
    version: 1,
    created_at: '2026-08-25T00:00:00Z',
    updated_at: '2026-08-25T00:00:00Z',
    type_details: null,
    members: [],
    participants: [],
    metadata: null,
  };
}

console.log('\n=== Review Center Detail Lifecycle Integration ===');

assert(reviewStatusLabel('submitted') === '待确认', 'detail top submitted label is 待确认');

const pageSource = fs.readFileSync('src/app/review-center/reviews/[id]/page.tsx', 'utf8');
const lifecycleIndex = pageSource.indexOf('<LifecycleSection');
const timelineIndex = pageSource.indexOf('<TimelineSection');
assert(lifecycleIndex > -1 && timelineIndex > -1 && lifecycleIndex < timelineIndex, 'LifecycleSection before TimelineSection');
for (const required of [
  'status={review.status}',
  'version={review.version}',
  'ownerId={review.owner_id}',
  'pmoId={review.pmo_id}',
  'currentProfileId={me?.profile_id ?? null}',
  'currentRole={me?.role ?? null}',
  'editHref={',
  'refreshKey={timelineRefreshKey}',
  'applyLifecycleSuccessToDetail',
  'reloadAuthority(false)',
  'requestId !== requestIdRef.current',
]) {
  assert(pageSource.includes(required), 'detail page contains: ' + required);
}

const refreshIncrement = pageSource.indexOf('setTimelineRefreshKey(key => key + 1)');
const authorityRefreshCallback = pageSource.indexOf('const handleAuthorityRefresh');
const successCallback = pageSource.indexOf('const handleLifecycleSuccess');
assert(
  refreshIncrement > -1
    && authorityRefreshCallback > -1
    && successCallback > -1
    && refreshIncrement > authorityRefreshCallback,
  'timeline refresh increment lives only in authority refresh callback',
);
assert(
  pageSource.slice(successCallback, authorityRefreshCallback).includes('setTimelineRefreshKey') === false,
  'success callback does not increment timeline refresh',
);
assert(
  (pageSource.match(/setTimelineRefreshKey\(key => key \+ 1\)/g) || []).length === 1,
  'timeline refresh increment exactly once per authority event wiring',
);
for (const forbidden of ['window.location.reload', 'CustomEvent', 'supabase.rpc']) {
  assert(!pageSource.includes(forbidden), 'detail page excludes: ' + forbidden);
}

const timelineSource = fs.readFileSync('src/app/review-center/reviews/[id]/timeline-section.tsx', 'utf8');
assert(timelineSource.includes('refreshKey?: number'), 'timeline refreshKey prop optional');
assert(timelineSource.includes('[reviewId, refreshKey]'), 'timeline effect depends on refreshKey');

const successData: LifecycleSuccessData = {
  status: 'submitted',
  version: 2,
  submittedAt: '2026-08-25T00:00:00Z',
  closedAt: null,
};
const patched = applyLifecycleSuccessToDetail(makeDetail(), successData);
assert(patched.status === 'submitted' && patched.version === 2 && patched.submitted_at === '2026-08-25T00:00:00Z' && patched.closed_at === null, 'success patches status/version/timestamps');

const reopened = applyLifecycleSuccessToDetail(makeDetail(), {
  status: 'draft',
  version: 6,
  submittedAt: null,
  closedAt: null,
});
assert(reopened.submitted_at === null && reopened.closed_at === null, 'reopen clears timestamps locally');

const inputs: Array<{ offset: number }> = [];
const refreshController = new TimelineSectionController({
  fetchPage: async input => {
    inputs.push({ offset: input.offset });
    return inputs.length === 1
      ? pageResult([makeItem('old')])
      : pageResult([makeItem('new')]);
  },
  onStateChange: () => {},
});
refreshController.start('A');
await tick();
assert(refreshController.getState().items[0]?.id === 'old', 'initial timeline loaded');
refreshController.start('A');
assert(refreshController.getState().items.length === 0, 'refresh clears old timeline items');
assert(inputs.length === 2 && inputs[1].offset === 0, 'refresh restarts from offset 0');
await tick();
assert(refreshController.getState().items.length === 1 && refreshController.getState().items[0].id === 'new', 'refresh replaces items with new initial page');

const gate1 = deferred<TimelinePageFetchResult>();
const gate2 = deferred<TimelinePageFetchResult>();
let callNo = 0;
const staleController = new TimelineSectionController({
  fetchPage: async () => {
    callNo++;
    return callNo === 1 ? gate1.promise : gate2.promise;
  },
  onStateChange: () => {},
});
staleController.start('A');
staleController.start('A');
gate1.resolve(pageResult([makeItem('stale')]));
await tick();
assert(staleController.getState().items.length === 0, 'stale refresh response blocked');
gate2.resolve(pageResult([makeItem('fresh')]));
await tick();
assert(staleController.getState().items.length === 1 && staleController.getState().items[0].id === 'fresh', 'latest refresh response applied');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
