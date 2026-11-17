import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WOS_P2_MATERIALS,
  evaluateWosP2Readiness,
  type WosP2ReadinessInput,
} from '../../src/lib/workshop-orders/p2-qa-readiness';

const now = '2026-11-17T12:20:00.000Z';
const actor = '11111111-1111-4111-8111-111111111111';
const good: WosP2ReadinessInput = {
  versionLabel: 'V2',
  currentBatchQuantity: 100,
  readVerified: true,
  resources: WOS_P2_MATERIALS.map(row => ({
    resource_type: row.code,
    status: row.acceptedStatus,
    version_label: 'V2',
    quantity_expected: 100,
    quantity_arrived: 100,
    confirmed_by_profile_id: actor,
    confirmed_at: now,
    note: 'QA approved synthetic resource',
  })),
  blockers: [],
  baselines: [{
    status: 'CURRENT', version_label: 'V2',
    office_confirmed_at: now, workshop_confirmed_at: now,
  }],
};

const ready = evaluateWosP2Readiness(good);
assert.equal(ready.materialsVerified, true);
assert.equal(ready.canStart, false, 'material preview is NEVER a production start authorization');
assert.equal(ready.source, 'QA_RLS_READ_ONLY');
assert.equal(ready.materials.length, 4);
assert.equal(ready.issues.length, 0);

const failures: Array<[string,WosP2ReadinessInput]> = [
  ['RLS denied', {...good,readVerified:false}],
  ['missing film', {...good,resources: good.resources.filter(r => r.resource_type !== 'FILM')}],
  ['unknown resource category', {...good,resources:[...good.resources,{...good.resources[0],resource_type:'UNKNOWN_QA_MATERIAL'}]}],
  ['duplicated fixture', {...good,resources:[...good.resources,good.resources[1]]}],
  ['stale film', {...good,resources:good.resources.map(r => r.resource_type === 'FILM' ? {...r,version_label:'V1'} : r)}],
  ['unverified film', {...good,resources:good.resources.map(r => r.resource_type === 'FILM' ? {...r,status:'ARRIVED'} : r)}],
  ['fixture not fit', {...good,resources:good.resources.map(r => r.resource_type === 'FIXTURE' ? {...r,status:'ARRIVED'} : r)}],
  ['signed sample not verified', {...good,resources:good.resources.map(r => r.resource_type === 'SIGNED_SAMPLE' ? {...r,status:'UPLOADED'} : r)}],
  ['quantity short', {...good,resources:good.resources.map(r => r.resource_type === 'INCOMING_MATERIAL' ? {...r,quantity_arrived:99} : r)}],
  ['expected quantity short', {...good,resources:good.resources.map(r => r.resource_type === 'INCOMING_MATERIAL' ? {...r,quantity_expected:99} : r)}],
  ['missing confirmer', {...good,resources:good.resources.map(r => r.resource_type === 'FIXTURE' ? {...r,confirmed_by_profile_id:null} : r)}],
  ['missing confirmed time', {...good,resources:good.resources.map(r => r.resource_type === 'FIXTURE' ? {...r,confirmed_at:null} : r)}],
  ['absent baseline', {...good,baselines:[]}],
  ['stale baseline', {...good,baselines:[{...good.baselines[0],version_label:'V1'}]}],
  ['duplicate baselines', {...good,baselines:[good.baselines[0],good.baselines[0]]}],
  ['office not confirmed', {...good,baselines:[{...good.baselines[0],office_confirmed_at:null}]}],
  ['workshop not confirmed', {...good,baselines:[{...good.baselines[0],workshop_confirmed_at:null}]}],
  ['open blocker', {...good,blockers:[{status:'OPEN',blocker_code:'MISSING_SAMPLE',description:'未确认签样'}]}],
  ['waived but unreviewed blocker', {...good,blockers:[{status:'WAIVED',blocker_code:'MISSING_SAMPLE',description:'还未获授权豁免'}]}],
  ['zero batch', {...good,currentBatchQuantity:0}],
  ['invalid version', {...good,versionLabel:''}],
];
for(const [reason,input] of failures) {
  const result=evaluateWosP2Readiness(input);
  assert.equal(result.materialsVerified,false,reason);
  assert.equal(result.canStart,false,reason);
}
const malformed=evaluateWosP2Readiness({...good,resources:null as unknown as WosP2ReadinessInput['resources']});
assert.equal(malformed.materialsVerified,false);
assert.equal(malformed.materials.every(row => !row.ready),true);
const immutable=JSON.stringify(good);
evaluateWosP2Readiness(good);
assert.equal(JSON.stringify(good),immutable,'pure readiness evaluation must not change data');

const ui=readFileSync('src/components/workshop-orders/LiveQaWorkshopReadiness.tsx','utf8');
const inbox=readFileSync('src/components/workshop-orders/LiveQaWorkshopInbox.tsx','utf8');
for(const table of ['wos_resource_readiness','wos_blockers','wos_visual_baselines','wos_confirmations']) {
  assert(ui.includes("from('"+table+"')"),'must read live RLS table '+table);
}
assert(ui.includes("eq('organization_id',organizationId)"));
assert(ui.includes("eq('entity_id',orderId)"));
assert(ui.includes("eq('entity_type','PRODUCTION_ORDER')"));
assert(ui.includes('QA_READINESS_UNVERIFIED_OR_DENIED'));
assert(ui.includes('setReadState(null)'));
assert(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(|\.rpc\s*\(/.test(ui),
  'readiness panel must never secretly mutate QA data');
assert(ui.includes('必须通过独立审核并安装最小权限 QA 事务 RPC'));
assert(inbox.includes('<LiveQaWorkshopReadiness'));
assert(inbox.includes('currentBatchQuantity={Number(details[item.id].current_batch_quantity)}'));
console.log('workshop-order-p2-qa-readiness.test.ts: PASS');
console.log('WOS_P2_READINESS_FAIL_CLOSED_CASES='+failures.length);
console.log('WOS_P2_NO_DATABASE_WRITE_OR_START=PASS');
