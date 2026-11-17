import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseWosProductionSubmitEnvelope,
  resolveWosApiActor,
  canSubmitWosOfficeRequest,
} from '../../src/lib/workshop-orders/api-contract';

const valid = {
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  expectedVersion: 1,
  payload: {
    orderId: '22222222-2222-4222-8222-222222222222',
    versionLabel: 'V1',
  },
};
assert.deepEqual(parseWosProductionSubmitEnvelope(valid), {
  idempotencyKey: valid.idempotencyKey,
  expectedVersion: 1,
  orderId: valid.payload.orderId,
  versionLabel: 'V1',
});
assert.equal(parseWosProductionSubmitEnvelope({
  ...valid, payload: {...valid.payload, workflowStatus:'IN_PRODUCTION'},
}),null);
assert.equal(parseWosProductionSubmitEnvelope({
  ...valid, payload:{...valid.payload, organizationId:valid.payload.orderId},
}),null);
assert.equal(parseWosProductionSubmitEnvelope({
  ...valid,payload:{orderId:valid.payload.orderId,versionLabel:'V0'},
}),null);
assert.equal(parseWosProductionSubmitEnvelope({
  ...valid,payload:{orderId:'wrong',versionLabel:'V1'},
}),null);
assert.equal(parseWosProductionSubmitEnvelope({
  ...valid,payload:{...valid.payload, arbitrary:'extra'},
}),null);
assert.equal(parseWosProductionSubmitEnvelope({
  ...valid,expectedVersion:0,
}),null);
const operator = resolveWosApiActor(
  '33333333-3333-4333-8333-333333333333',
  {id:'44444444-4444-4444-8444-444444444444',
   user_id:'33333333-3333-4333-8333-333333333333',
   org_id:'55555555-5555-4555-8555-555555555555',role:'operator',is_active:true},
);
assert.equal(operator.ok,true);
assert.equal(canSubmitWosOfficeRequest('operator'),false);
assert.equal(canSubmitWosOfficeRequest('sales'),true);

const server=readFileSync('src/lib/workshop-orders/api-server.ts','utf8');
const implementation=readFileSync('src/lib/workshop-orders/p7-nonprod-submit.ts','utf8');
assert(server.includes("process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true'"));
assert(server.includes("entityType === 'PRODUCTION_ORDER'"));
assert(server.includes('ATOMIC_SUBMISSION_RPC_REQUIRED'));
assert(implementation.includes("process.env.VERCEL_ENV !== 'production'"));
assert(implementation.includes('isApprovedWosSandboxUrl'));
assert(implementation.includes("client.rpc('wos_submit_production_order'"));
assert(implementation.includes('PERSISTENCE_STATUS_UNVERIFIED'));
assert(implementation.includes("client.from('wos_status_history')"));
assert(!implementation.includes('service_role'));
assert(!implementation.includes('.insert('));
assert(!implementation.includes('.upsert('));
console.log('workshop-order-p7-nonprod-contract.test.ts: PASS');
