import assert from 'node:assert/strict';
import {
  isValidQaRecovery, verifyQaImageSignature, qaFileSha256, readQaRecovery, saveQaRecovery, clearQaRecovery, WOS_QA_RECOVERY_KEY, type QaRecovery,
} from '../../src/lib/workshop-orders/qa-recovery';

const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const org = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const uuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const imageId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const request = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const now = Date.now();
const base: QaRecovery = {
  schema: 1, createdAt: now, userId: uid, orgId: org,
  orderNumber: 'QA-NONPROD-' + uuid,
  versionLabel: 'V1', orderId: null, imageId: null,
  objectPath: null, fileSha256: null,
  idempotencyKey: request, stage: 'NEW',
};
assert.equal(isValidQaRecovery(base, uid, org, now), true, 'valid recovered QA sample');
assert.equal(isValidQaRecovery(base, uid, 'ffffffff-ffff-4fff-8fff-ffffffffffff', now), false, 'org isolation');
assert.equal(isValidQaRecovery(base, 'ffffffff-ffff-4fff-8fff-ffffffffffff', org, now), false, 'user isolation');
assert.equal(isValidQaRecovery(base, uid, org, now + 25 * 3600000), false, 'expired state');
assert.equal(isValidQaRecovery({...base, orderNumber:'REAL-CUSTOMER'}, uid, org, now), false, 'cannot resume real order');
const saved = {...base, orderId:uuid, imageId, stage:'DRAFT' as const,
 objectPath:'organizations/'+org+'/wos/production-order/'+uuid+'/images/product/versions/V1/'+imageId+'/qa-preview-proof.png'};
assert.equal(isValidQaRecovery(saved,uid,org,now),true,'valid scoped synthetic image path');
assert.equal(isValidQaRecovery({...saved,objectPath:'organizations/foreign/wos/prod'},uid,org,now),false,'foreign path');
assert.equal(isValidQaRecovery({...base,objectPath:saved.objectPath},uid,org,now),false,'no orphan path without identifiers');
assert.equal(isValidQaRecovery({...base, fileSha256:'not-a-real-digest'},uid,org,now),false,'invalid fingerprint');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZ0AAAAASUVORK5CYII=','base64');
assert.equal(await verifyQaImageSignature(new Blob([png],{type:'image/png'})),true,'valid PNG bytes');
assert.equal(await verifyQaImageSignature(new Blob([png],{type:'image/jpeg'})),false,'reject wrong MIME');
assert.equal(await verifyQaImageSignature(new Blob(['<script>malware</script>'],{type:'image/png'})),false,'reject spoofed magic');
assert.equal((await qaFileSha256(new Blob([png],{type:'image/png'}))).length,64,'content digest');
console.log('WOS_QA_RECOVERY_UNIT=PASS');

// Restart-simulation: QA identifiers survive a newly instantiated window;
// browser storage is actor/org-specific and never contains credential data.
const sharedLocal = new Map<string, string>();
const newStore = (data: Map<string,string>) => ({
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
});
const holder = globalThis as unknown as {window: {
  localStorage: ReturnType<typeof newStore>;
  sessionStorage: ReturnType<typeof newStore>;
}};
holder.window = {localStorage:newStore(sharedLocal), sessionStorage:newStore(new Map())};
saveQaRecovery(saved);
const scopedKey = WOS_QA_RECOVERY_KEY + uid + ':' + org;
assert.equal(sharedLocal.has(scopedKey), true, 'recovery persists locally');
assert.equal(sharedLocal.get(scopedKey)?.includes('access_token'), false, 'no token in QA recovery');
holder.window = {localStorage:newStore(sharedLocal), sessionStorage:newStore(new Map())};
assert.deepEqual(readQaRecovery(uid,org), saved, 'survives browser restart');
assert.equal(readQaRecovery(uid,'ffffffff-ffff-4fff-8fff-ffffffffffff'),null,'deny different organization');
assert.equal(readQaRecovery('ffffffff-ffff-4fff-8fff-ffffffffffff',org),null,'deny different actor');
clearQaRecovery(uid,org);
assert.equal(readQaRecovery(uid,org),null,'clear scoped recovery only');
const legacy = newStore(new Map());
legacy.setItem('hongda:wos-qa:synthetic-recovery:v1',JSON.stringify(saved));
holder.window = {localStorage:newStore(sharedLocal),sessionStorage:legacy};
assert.deepEqual(readQaRecovery(uid,org),saved,'migrate only matching legacy actor');
assert.equal(legacy.getItem('hongda:wos-qa:synthetic-recovery:v1'),null,'remove legacy after migration');
clearQaRecovery(uid,org);
console.log('WOS_QA_BROWSER_RESTART_SCOPED_RECOVERY_UNIT=PASS');
