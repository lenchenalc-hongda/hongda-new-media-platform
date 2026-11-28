import assert from 'node:assert/strict';
import { sendWecomSandboxMessage, type WecomFetch } from '../../src/lib/customer-projects/wecom-sandbox-transport';

console.log('\n=== CPC P2-B WeCom API Sandbox Transport: No Live Network ===');

const config = {
  corpId: 'ww1234567890abcdef',
  agentId: 1000003,
  appSecret: 'TEST_SECRET_MOCK_NEVER_USED_ON_NETWORK',
  environment: 'preview' as const,
  sandboxEnabled: true,
  trustedEgressVerified: true,
  allowedTestWecomUserId: 'owner_qa',
};
let requests = 0;
const responder: WecomFetch = async (url, init) => {
  requests++;
  if (url.includes('/gettoken?')) {
    assert.ok(url.startsWith('https://qyapi.weixin.qq.com/cgi-bin/gettoken?'));
    assert.equal(init?.method, 'GET');
    return new Response(JSON.stringify({ errcode: 0, access_token: 'TEST_MOCK_ACCESS_TOKEN' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  assert.ok(url.startsWith('https://qyapi.weixin.qq.com/cgi-bin/message/send?'));
  assert.equal(init?.method, 'POST');
  const body = JSON.parse(String(init?.body));
  assert.equal(body.touser, 'owner_qa');
  assert.notEqual(body.touser, '@all');
  assert.equal(body.agentid, 1000003);
  assert.equal(body.text.content, '待办提醒：请登录 HongdaOS 查看。');
  return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const input = {
  config, recipientWecomUserId: 'owner_qa',
  recipientVerified: true, sourceCurrent: true,
  text: '待办提醒：请登录 HongdaOS 查看。',
  fetcher: responder,
};
const ok = await sendWecomSandboxMessage(input);
assert.deepEqual(ok, { status: 'finished', outcome: { kind: 'accepted' } });
assert.equal(requests, 2, 'token and send called exactly once with mocked HTTP');

for (const change of [
  { config: { ...config, environment: 'production' as const } },
  { config: { ...config, sandboxEnabled: false } },
  { config: { ...config, trustedEgressVerified: false } },
  { recipientVerified: false },
  { sourceCurrent: false },
]) {
  const before: number = requests;
  assert.deepEqual(await sendWecomSandboxMessage({ ...input, ...change }),
    { status: 'blocked', reason: 'NOT_AUTHORIZED' });
  assert.equal(requests, before, 'denied request must never fetch anything');
}
for (const recipientWecomUserId of ['@all', 'owner_qa|sales_02', 'wrong_user', 'owner_qa\ncc']) {
  const before: number = requests;
  const denied = await sendWecomSandboxMessage({ ...input, recipientWecomUserId });
  assert.deepEqual(denied, { status: 'blocked', reason: 'INVALID_TARGET' });
  assert.equal(requests, before);
}
for (const corrupt of [{ corpId: 'bad' }, { agentId: 0 }, { appSecret: '' }]) {
  const before: number = requests;
  assert.deepEqual(await sendWecomSandboxMessage({ ...input, config: { ...config, ...corrupt } }),
    { status: 'blocked', reason: 'INVALID_CONFIG' });
  assert.equal(requests, before);
}

let attemptedSend = false;
const tokenDown: WecomFetch = async () =>
  new Response(JSON.stringify({ errcode: 40013 }), { status: 200 });
const tokenResult = await sendWecomSandboxMessage({ ...input, fetcher: tokenDown });
assert.deepEqual(tokenResult, { status: 'finished',
  outcome: { kind: 'retryable_rejected', code: 'TOKEN_UNAVAILABLE' } });

const sendError = async (code: number, invaliduser?: string) => {
  attemptedSend = false;
  const fake: WecomFetch = async (url) => {
    if (url.includes('/gettoken?')) {
      return new Response(JSON.stringify({ errcode: 0, access_token: 'mock' }), { status: 200 });
    }
    attemptedSend = true;
    return new Response(JSON.stringify({
      errcode: code, ...(invaliduser === undefined ? {} : { invaliduser }),
    }), { status: 200 });
  };
  return sendWecomSandboxMessage({ ...input, fetcher: fake });
};
assert.deepEqual(await sendError(0, 'owner_qa'), {
  status: 'finished', outcome: { kind: 'permanent_rejected', code: 'INVALID_USER' },
});
// WeCom errcode 0 can still contain rejected/unlicensed recipients. Never
// mark those accepted, even though the top-level provider call succeeded.
for (const partial of [
  { field: 'unlicenseduser', code: 'UNLICENSED_USER' },
  { field: 'invalidparty', code: 'INVALID_PARTY' },
  { field: 'invalidtag', code: 'INVALID_TAG' },
]) {
  const mock: WecomFetch = async (url) => new Response(JSON.stringify(
    url.includes('/gettoken?')
      ? { errcode: 0, access_token: 'mock' }
      : { errcode: 0, [partial.field]: 'owner_qa' }
  ), { status: 200 });
  assert.deepEqual(await sendWecomSandboxMessage({ ...input, fetcher: mock }), {
    status: 'finished', outcome: { kind: 'permanent_rejected', code: partial.code },
  });
}
const malformed: WecomFetch = async (url) => new Response(JSON.stringify(
  url.includes('/gettoken?')
    ? { errcode: 0, access_token: 'mock' }
    : { errcode: 0, unlicenseduser: ['owner_qa'] }
), { status: 200 });
assert.deepEqual(await sendWecomSandboxMessage({ ...input, fetcher: malformed }), {
  status: 'finished', outcome: { kind: 'unknown', code: 'RESPONSE_MALFORMED' },
});
assert.ok(attemptedSend, 'mock sends were invoked');
assert.deepEqual(await sendError(45009), {
  status: 'finished', outcome: { kind: 'retryable_rejected', code: '45009' },
});
assert.deepEqual(await sendError(40014), {
  status: 'finished', outcome: { kind: 'retryable_rejected', code: '40014' },
});
assert.deepEqual(await sendError(81013), {
  status: 'finished', outcome: { kind: 'permanent_rejected', code: '81013' },
});
const networkDrop: WecomFetch = async (url) => {
  if (url.includes('/gettoken?'))
    return new Response(JSON.stringify({ errcode: 0, access_token: 'mock' }), { status: 200 });
  throw Error('SIMULATED_RESPONSE_DROPPED_AFTER_PROVIDER_ACCEPTED');
};
assert.deepEqual(await sendWecomSandboxMessage({ ...input, fetcher: networkDrop }), {
  status: 'finished', outcome: { kind: 'unknown', code: 'SEND_NETWORK_UNKNOWN' },
}, 'unknown after send is NEVER classified as retryable');

const tokenNetworkDrop: WecomFetch = async () => { throw Error('SIMULATED_PRE_SEND_FAILURE'); };
assert.deepEqual(await sendWecomSandboxMessage({ ...input, fetcher: tokenNetworkDrop }), {
  status: 'finished', outcome: { kind: 'retryable_rejected', code: 'TOKEN_NETWORK' },
});
const sendNoJson: WecomFetch = async (url) => {
  if (url.includes('/gettoken?'))
    return new Response(JSON.stringify({ errcode: 0, access_token: 'mock' }), { status: 200 });
  return new Response('not-json', { status: 500 });
};
assert.deepEqual(await sendWecomSandboxMessage({ ...input, fetcher: sendNoJson }), {
  status: 'finished', outcome: { kind: 'unknown', code: 'SEND_UNCONFIRMED' },
});
console.log('PASS: credential gate, sandbox recipient, message API, partial failure, uncertain delivery, no live network');
