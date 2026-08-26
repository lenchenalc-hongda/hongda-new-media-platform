// ===== Review Center Action Client Unit Tests =====
import * as client from '../../src/lib/review-center/action-client';
import {
  ActionClientError,
  cancelAction,
  createAction,
  fetchActionOwnerDirectory,
  fetchActions,
  returnAction,
  startAction,
  submitActionForVerification,
  updateAction,
  verifyAction,
} from '../../src/lib/review-center/action-client';

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

const REVIEW_ID = '00000000-0000-0000-0000-000000000001';
const ACTION_ID = '00000000-0000-0000-0000-000000000002';
const OWNER_ID = '00000000-0000-0000-0000-000000000003';

const commandSuccess = {
  ok: true,
  code: 'OK',
  message: 'success',
  data: {
    action: {
      id: ACTION_ID,
      sequence: 1,
      status: 'OPEN',
      version: 1,
      updatedAt: '2026-08-25T00:00:00Z',
      completedAt: null,
      verifiedAt: null,
      cancelledAt: null,
    },
  },
};

const readSuccess = {
  ok: true,
  code: 'OK',
  message: 'success',
  data: {
    actions: [{
      id: ACTION_ID,
      sequence: 1,
      title: 'QA ACTION',
      description: null,
      actionType: 'CORRECTIVE',
      status: 'OPEN',
      dueDate: '2026-08-26',
      isOverdue: false,
      version: 1,
      owner: {
        profileId: OWNER_ID,
        displayName: '张三',
        role: 'operator',
        department: '车间',
        isActive: true,
      },
      createdBy: {
        profileId: OWNER_ID,
        displayName: '张三',
        role: 'operator',
        department: '车间',
        isActive: true,
      },
      completionNote: null,
      verificationNote: null,
      verifiedBy: null,
      completedAt: null,
      verifiedAt: null,
      cancelledAt: null,
      cancelReason: null,
      createdAt: '2026-08-25T00:00:00Z',
      updatedAt: '2026-08-25T00:00:00Z',
    }],
  },
};

let lastRequest: { url: string; init?: RequestInit } | null = null;
let handler: (url: string, init?: RequestInit) => Promise<Response> = async () => new Response();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch() {
  const original = (globalThis as any).fetch;
  (globalThis as any).fetch = async (input: any, init?: any) => {
    lastRequest = { url: String(input), init };
    return handler(String(input), init);
  };
  return () => {
    (globalThis as any).fetch = original;
  };
}

console.log('\n=== Review Center Action Client ===');

assert(!('executeActionCommand' in client), 'no generic command gateway export');
assert(typeof client.fetchActions === 'function', 'fetchActions exported');
assert(typeof client.createAction === 'function', 'createAction exported');
assert(typeof client.updateAction === 'function', 'updateAction exported');
assert(typeof client.startAction === 'function', 'startAction exported');
assert(typeof client.submitActionForVerification === 'function', 'submit exported');
assert(typeof client.verifyAction === 'function', 'verifyAction exported');
assert(typeof client.returnAction === 'function', 'returnAction exported');
assert(typeof client.cancelAction === 'function', 'cancelAction exported');
assert(typeof client.fetchActionOwnerDirectory === 'function', 'owner directory exported');

async function run() {
  const restore = installFetch();
  try {
    handler = async () => jsonResponse(readSuccess);
    const actions = await fetchActions(REVIEW_ID);
    assert(lastRequest?.url === `/api/review-center/reviews/${REVIEW_ID}/actions`, 'fetch actions URL');
    assert((lastRequest?.init?.method ?? 'GET') === 'GET', 'fetch actions GET');
    assert(actions.length === 1 && actions[0].status === 'OPEN', 'fetch actions payload');

    handler = async () => jsonResponse(commandSuccess, 201);
    await createAction(REVIEW_ID, {
      title: 'T',
      description: null,
      actionType: 'CORRECTIVE',
      ownerProfileId: OWNER_ID,
      dueDate: '2026-08-26',
    });
    assert(lastRequest?.url === `/api/review-center/reviews/${REVIEW_ID}/actions`, 'create URL');
    assert(lastRequest?.init?.method === 'POST', 'create POST');
    const createBody = JSON.parse(String(lastRequest?.init?.body));
    assert(createBody.title === 'T' && createBody.description === null && createBody.ownerProfileId === OWNER_ID, 'create body camelCase');

    handler = async () => jsonResponse(commandSuccess);
    await updateAction(REVIEW_ID, ACTION_ID, {
      expectedVersion: 1,
      title: 'T2',
      description: null,
      actionType: 'PREVENTIVE',
      ownerProfileId: OWNER_ID,
      dueDate: '2026-08-27',
    });
    assert(lastRequest?.url === `/api/review-center/reviews/${REVIEW_ID}/actions/${ACTION_ID}`, 'update URL');
    assert(lastRequest?.init?.method === 'PATCH', 'update PATCH');
    const updateBody = JSON.parse(String(lastRequest?.init?.body));
    assert(updateBody.expectedVersion === 1 && updateBody.description === null, 'update body');

    handler = async () => jsonResponse(commandSuccess);
    await startAction(REVIEW_ID, ACTION_ID, 1);
    assert(lastRequest?.url === `/api/review-center/reviews/${REVIEW_ID}/actions/${ACTION_ID}/start`, 'start URL');
    assert(lastRequest?.init?.method === 'POST', 'start POST');

    handler = async () => jsonResponse(commandSuccess);
    await submitActionForVerification(REVIEW_ID, ACTION_ID, 1, 'done');
    assert(lastRequest?.url === `/api/review-center/reviews/${REVIEW_ID}/actions/${ACTION_ID}/submit-for-verification`, 'submit URL');
    assert(JSON.parse(String(lastRequest?.init?.body)).completionNote === 'done', 'submit body');

    handler = async () => jsonResponse(commandSuccess);
    await verifyAction(REVIEW_ID, ACTION_ID, 1, null);
    assert(lastRequest?.url === `/api/review-center/reviews/${REVIEW_ID}/actions/${ACTION_ID}/verify`, 'verify URL');
    assert(JSON.parse(String(lastRequest?.init?.body)).verificationNote === null, 'verify body null');

    handler = async () => jsonResponse(commandSuccess);
    await returnAction(REVIEW_ID, ACTION_ID, 1, 'why');
    assert(lastRequest?.url === `/api/review-center/reviews/${REVIEW_ID}/actions/${ACTION_ID}/return`, 'return URL');
    assert(JSON.parse(String(lastRequest?.init?.body)).reason === 'why', 'return body');

    handler = async () => jsonResponse(commandSuccess);
    await cancelAction(REVIEW_ID, ACTION_ID, 1, 'stop');
    assert(lastRequest?.url === `/api/review-center/reviews/${REVIEW_ID}/actions/${ACTION_ID}/cancel`, 'cancel URL');
    assert(JSON.parse(String(lastRequest?.init?.body)).reason === 'stop', 'cancel body');

    handler = async () => jsonResponse({
      ok: true,
      code: 'OK',
      data: {
        items: [{
          profile_id: OWNER_ID,
          display_name: '张三',
          role: 'operator',
          department: '车间',
          assignment_eligible: true,
        }],
      },
    });
    const owners = await fetchActionOwnerDirectory();
    assert(lastRequest?.url === '/api/review-center/profile-directory?purpose=ACTION_OWNER', 'owner directory URL');
    assert(owners.length === 1 && owners[0].profileId === OWNER_ID && owners[0].assignmentEligible, 'owner directory camelCase');

    handler = async () => jsonResponse({ ok: false, code: 'VERSION_CONFLICT', message: 'RAW SECRET', data: null }, 409);
    try {
      await startAction(REVIEW_ID, ACTION_ID, 1);
      assert(false, 'version conflict should throw');
    } catch (error) {
      assert(error instanceof ActionClientError, 'ActionClientError instance');
      const e = error as ActionClientError;
      assert(e.status === 409 && e.code === 'VERSION_CONFLICT', 'version conflict status/code');
      assert(e.message === '操作失败，请稍后重试' && !e.message.includes('RAW'), 'version conflict safe message');
    }

    handler = async () => jsonResponse({ ok: false, code: 'SELF_VERIFICATION_FORBIDDEN', message: 'RAW', data: null }, 403);
    try {
      await verifyAction(REVIEW_ID, ACTION_ID, 1, null);
      assert(false, 'self verification should throw');
    } catch (error) {
      assert((error as ActionClientError).code === 'SELF_VERIFICATION_FORBIDDEN', 'self verification code');
    }

    handler = async () => jsonResponse({ ok: false, code: 'INVALID_OWNER', message: 'RAW', data: null }, 400);
    try {
      await createAction(REVIEW_ID, {
        title: 'T',
        actionType: 'CORRECTIVE',
        ownerProfileId: OWNER_ID,
        dueDate: '2026-08-26',
      });
      assert(false, 'invalid owner should throw');
    } catch (error) {
      assert((error as ActionClientError).code === 'INVALID_OWNER', 'invalid owner code');
    }

    handler = async () => jsonResponse({ ok: false, code: 'RAW_CODE', message: 'RAW SECRET', data: null }, 500);
    try {
      await fetchActions(REVIEW_ID);
      assert(false, 'generic should throw');
    } catch (error) {
      const e = error as ActionClientError;
      assert(e.message === '操作失败，请稍后重试' && !e.message.includes('RAW'), 'generic safe message');
    }

    handler = async () => new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } });
    try {
      await fetchActions(REVIEW_ID);
      assert(false, 'malformed json should throw');
    } catch (error) {
      assert((error as ActionClientError).code === 'INTERNAL_ERROR', 'malformed json internal');
    }

    handler = async () => { throw new Error('NETWORK FAILURE'); };
    try {
      await fetchActions(REVIEW_ID);
      assert(false, 'network should throw');
    } catch (error) {
      const e = error as ActionClientError;
      assert(e.code === 'NETWORK_ERROR' && e.message === '操作失败，请稍后重试', 'network safe error');
    }
  } finally {
    restore();
  }

  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
  if (failed > 0) process.exitCode = 1;
}

run().catch(error => {
  console.error('Action client tests crashed:', String(error?.message || error));
  process.exit(1);
});
