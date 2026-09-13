// ===== Review Center Detail Timeline Section Controller Tests =====
import {
  TimelineSectionController,
  type TimelinePageFetchResult,
  type TimelineSectionState,
} from '../../src/lib/review-center/timeline-presentation';
import type { TimelineItemDTO } from '../../src/lib/review-center/timeline';

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
    actor: { displayName: '张三', role: 'admin', isActive: true },
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

function createController(
  fetchPage: (input: { reviewId: string; limit: number; offset: number }) => Promise<TimelinePageFetchResult>,
): { controller: TimelineSectionController; states: TimelineSectionState[] } {
  const states: TimelineSectionState[] = [];
  const controller = new TimelineSectionController({
    fetchPage,
    onStateChange: state => states.push(state),
  });
  return { controller, states };
}

console.log('\n=== Review Center Detail Timeline Controller ===');

const initialCalls: Array<{ reviewId: string; limit: number; offset: number }> = [];
const initialController = createController(async input => {
  initialCalls.push(input);
  return pageResult([]);
});
initialController.controller.start('review-a');
assert(
  initialCalls.length === 1
    && initialCalls[0].reviewId === 'review-a'
    && initialCalls[0].limit === 30
    && initialCalls[0].offset === 0,
  'initial fetch uses review id limit 30 offset 0',
);
await tick();
assert(
  initialController.controller.getState().status === 'ready'
    && initialController.controller.getState().items.length === 0,
  'empty initial success ready',
);

const successController = createController(async () => pageResult([makeItem('e1')]));
successController.controller.start('review-a');
await tick();
assert(
  successController.controller.getState().status === 'ready'
    && successController.controller.getState().items[0]?.id === 'e1',
  'initial success renders items',
);

const errorController = createController(async () => ({ status: 500, ok: false }));
errorController.controller.start('review-a');
await tick();
assert(
  errorController.controller.getState().status === 'error'
    && errorController.controller.getState().initialErrorStatus === 500,
  'initial failure scoped error',
);

let retryAttempts = 0;
const retryCalls: Array<{ offset: number }> = [];
const retryController = createController(async input => {
  retryCalls.push({ offset: input.offset });
  retryAttempts++;
  return retryAttempts === 1
    ? { status: 500, ok: false }
    : pageResult([makeItem('retry-item')]);
});
retryController.controller.start('review-a');
await tick();
assert(retryController.controller.getState().status === 'error', 'retry starts from error');
retryController.controller.retryInitial();
assert(
  retryCalls.length === 2 && retryCalls[1].offset === 0,
  'retry restarts initial from offset 0',
);
await tick();
const retryState = retryController.controller.getState();
assert(
  retryState.status === 'ready'
    && retryState.items.length === 1
    && retryState.items[0].id === 'retry-item',
  'retry replaces items instead of appending',
);

const loadMoreCalls: Array<{ offset: number }> = [];
const loadMoreController = createController(async input => {
  loadMoreCalls.push({ offset: input.offset });
  return input.offset === 0
    ? pageResult([makeItem('e1')], true, 0, 30)
    : pageResult([makeItem('e2')], false, 30, null);
});
loadMoreController.controller.start('review-a');
await tick();
loadMoreController.controller.loadMore();
assert(loadMoreCalls.length === 2 && loadMoreCalls[1].offset === 30, 'load more uses server nextOffset');
await tick();
assert(
  loadMoreController.controller.getState().items.map(item => item.id).join(',') === 'e1,e2',
  'load more appends next page',
);

const dedupeController = createController(async input =>
  input.offset === 0
    ? pageResult([makeItem('e1')], true, 0, 30)
    : pageResult([makeItem('e1'), makeItem('e2')], false, 30, null),
);
dedupeController.controller.start('review-a');
await tick();
dedupeController.controller.loadMore();
await tick();
assert(
  dedupeController.controller.getState().items.map(item => item.id).join(',') === 'e1,e2',
  'load more deduplicates by id',
);

const loadMoreGate = deferred<TimelinePageFetchResult>();
let offset30Calls = 0;
const lockController = createController(async input => {
  if (input.offset === 0) return pageResult([makeItem('e1')], true, 0, 30);
  offset30Calls++;
  return loadMoreGate.promise;
});
lockController.controller.start('review-a');
await tick();
lockController.controller.loadMore();
lockController.controller.loadMore();
assert(offset30Calls === 1, 'duplicate load more requests blocked');
loadMoreGate.resolve(pageResult([makeItem('e2')], false, 30, null));
await tick();
assert(
  lockController.controller.getState().items.map(item => item.id).join(',') === 'e1,e2',
  'load more lock releases after completion',
);

let failedLoadMoreAttempts = 0;
const failedLoadMoreCalls: Array<{ offset: number }> = [];
const failedLoadMoreController = createController(async input => {
  failedLoadMoreCalls.push({ offset: input.offset });
  if (input.offset === 0) return pageResult([makeItem('e1')], true, 0, 30);
  failedLoadMoreAttempts++;
  return failedLoadMoreAttempts === 1
    ? { status: 500, ok: false }
    : pageResult([makeItem('e2')], false, 30, null);
});
failedLoadMoreController.controller.start('review-a');
await tick();
failedLoadMoreController.controller.loadMore();
await tick();
const failedState = failedLoadMoreController.controller.getState();
assert(
  failedState.loadMoreError === true
    && failedState.loadMoreInFlight === false
    && failedState.items[0]?.id === 'e1'
    && failedState.pageInfo?.nextOffset === 30,
  'load more failure preserves existing items and page info',
);
failedLoadMoreController.controller.loadMore();
assert(
  failedLoadMoreCalls[failedLoadMoreCalls.length - 1].offset === 30,
  'load more retry preserves original nextOffset',
);
await tick();
assert(
  failedLoadMoreController.controller.getState().items.map(item => item.id).join(',') === 'e1,e2'
    && failedLoadMoreController.controller.getState().loadMoreError === false,
  'load more retry succeeds after failure',
);

const staleInitialA = deferred<TimelinePageFetchResult>();
const staleInitialB = deferred<TimelinePageFetchResult>();
const staleInitialController = createController(async input =>
  input.reviewId === 'A' ? staleInitialA.promise : staleInitialB.promise,
);
staleInitialController.controller.start('A');
staleInitialController.controller.start('B');
staleInitialA.resolve(pageResult([makeItem('a-old')]));
await tick();
assert(
  staleInitialController.controller.getState().items.length === 0,
  'stale initial response from old review blocked',
);
staleInitialB.resolve(pageResult([makeItem('b-new')]));
await tick();
assert(
  staleInitialController.controller.getState().items[0]?.id === 'b-new',
  'latest review response applied',
);

const staleRetryGate = deferred<TimelinePageFetchResult>();
let staleRetryAttempts = 0;
const staleRetryController = createController(async input => {
  if (input.reviewId === 'A') {
    staleRetryAttempts++;
    if (staleRetryAttempts === 1) return { status: 500, ok: false };
    return staleRetryGate.promise;
  }
  return pageResult([makeItem('b-latest')]);
});
staleRetryController.controller.start('A');
await tick();
staleRetryController.controller.retryInitial();
staleRetryController.controller.start('B');
staleRetryGate.resolve(pageResult([makeItem('a-retry')]));
await tick();
await tick();
assert(
  staleRetryController.controller.getState().items[0]?.id === 'b-latest'
    && staleRetryController.controller.getState().items.length === 1,
  'stale retry response from old review blocked',
);

const invalidatedGate = deferred<TimelinePageFetchResult>();
const invalidatedController = createController(async () => invalidatedGate.promise);
invalidatedController.controller.start('A');
invalidatedController.controller.invalidate();
invalidatedGate.resolve(pageResult([makeItem('stale')]));
await tick();
assert(
  invalidatedController.controller.getState().items.length === 0,
  'invalidate blocks late response without next review',
);

const staleLoadMoreGate = deferred<TimelinePageFetchResult>();
const staleLoadMoreController = createController(async input => {
  if (input.offset === 0) {
    return input.reviewId === 'A'
      ? pageResult([makeItem('a1')], true, 0, 30)
      : pageResult([makeItem('b1')]);
  }
  return staleLoadMoreGate.promise;
});
staleLoadMoreController.controller.start('A');
await tick();
staleLoadMoreController.controller.loadMore();
staleLoadMoreController.controller.start('B');
staleLoadMoreGate.resolve(pageResult([makeItem('a-stale')], false, 30, null));
await tick();
await tick();
assert(
  staleLoadMoreController.controller.getState().items[0]?.id === 'b1'
    && staleLoadMoreController.controller.getState().items.length === 1,
  'stale load more response from old review blocked',
);

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
