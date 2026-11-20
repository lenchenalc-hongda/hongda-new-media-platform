import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  evaluateWosP2HandoffTimeline,
  WOS_P2_HANDOFF_STEPS,
  type WosP2HandoffHistory,
  type WosP2HandoffInput,
} from '../../src/lib/workshop-orders/p2-handoff-timeline';

// Read-only, synthetic reconstruction of the six observed QA state-history
// transitions. NO network requests, no privileged role, no QA writes.
const seed: WosP2HandoffHistory[] = WOS_P2_HANDOFF_STEPS.map((step,i) => ({
  previous_status: step.from,
  next_status: step.to,
  actor_role: i===1 || i===2 || i===5 ? 'operator' : 'admin',
  reason_code: step.reason,
  created_at: new Date(Date.UTC(2026,10,18,12,0,i)).toISOString(),
}));
const current: WosP2HandoffInput = {
  history: [...seed].reverse(), // real client loads newest-first
  currentStatus: 'WAITING_MATERIAL', currentVersion: 7, readVerified:true,
};
const good = evaluateWosP2HandoffTimeline(current);
assert.equal(good.historySequenceVerified,true,'valid ordered six-stage history should match');
assert.equal(good.steps.filter(x=>x.verifiedByHistory).length,6);
assert.equal(good.canStart,false,'no P2 history permits production start');
assert.equal(good.source,'QA_RLS_STATUS_HISTORY_ONLY');
assert(good.nextAction.includes('花膜'));
assert(good.nextAction.includes('签样'));
assert.equal(good.steps[5].label,'车间复核修订');

const negative: Array<[string,WosP2HandoffInput]> = [
  ['network/RLS unverified', {...current,readVerified:false}],
  ['missing submission', {...current,history:seed.slice(1)}],
  ['missing accept', {...current,history:seed.filter(x=>x.reason_code!=='QA_P2_ACCEPT')}],
  ['missing return', {...current,history:seed.filter(x=>x.reason_code!=='QA_P2_RETURN_FOR_INFORMATION')}],
  ['missing office save', {...current,history:seed.filter(x=>x.reason_code!=='QA_P2_OFFICE_SAVE_CORRECTION')}],
  ['missing office resubmit', {...current,history:seed.filter(x=>x.reason_code!=='QA_P2_OFFICE_RESUBMIT_CORRECTION')}],
  ['missing operator review', {...current,history:seed.slice(0,5)}],
  ['duplicate review', {...current,history:[...seed,seed[5]]}],
  ['duplicate correction', {...current,history:[...seed,seed[3]]}],
  ['wrong operator role', {...current,history:seed.map((x,i)=>i===1?{...x,actor_role:'sales'}:x)}],
  ['wrong office role', {...current,history:seed.map((x,i)=>i===4?{...x,actor_role:'operator'}:x)}],
  ['wrong status transition', {...current,history:seed.map((x,i)=>i===3?{...x,next_status:'WORKSHOP_REVIEW'}:x)}],
  ['wrong transition reason', {...current,history:seed.map((x,i)=>i===5?{...x,reason_code:'QA_P2_ACCEPT'}:x)}],
  ['conflicting chronology', {...current,history:seed.map((x,i)=>i===5?{...x,created_at:seed[2].created_at}:x)}],
  ['unparseable timestamp', {...current,history:seed.map((x,i)=>i===5?{...x,created_at:'not-a-time'}:x)}],
  ['source version still v2', {...current,currentVersion:2}],
  ['current order back to needs information', {...current,currentStatus:'NEEDS_INFORMATION'}],
  ['no QA data', {...current,history:[]}],
  ['too many rows / truncated', {...current,history:Array(100).fill(seed[0])}],
  ['extra latest transition', {...current,history:[...seed,{
    ...seed[0],reason_code:'QA_P2_MATERIAL_CONFIRM',
    previous_status:'WAITING_MATERIAL',next_status:'READINESS_CHECK',
    created_at:new Date(Date.UTC(2026,10,18,12,1,1)).toISOString()
  }]}],
];
for(const [label,input] of negative) {
  const result=evaluateWosP2HandoffTimeline(input);
  assert.equal(result.historySequenceVerified,false,label);
  assert.equal(result.canStart,false,label);
}
const orig=JSON.stringify(current);
evaluateWosP2HandoffTimeline(current);
assert.equal(JSON.stringify(current),orig,'pure history evaluator must not mutate RLS rows');

// Test hook: the UI must keep read-only RLS fetching with no service role,
// never infer completion from order status alone, and never open a gate.
const ui=readFileSync('src/components/workshop-orders/LiveQaWorkshopReadiness.tsx','utf8');
assert(ui.includes('evaluateWosP2HandoffTimeline('));
assert(ui.includes('readState.handoff.steps.map('));
assert(ui.includes('readState.handoff.historySequenceVerified'));
assert(ui.includes('QA_RLS_STATUS_HISTORY_ONLY'));
assert(ui.includes("from('wos_status_history')"));
assert(ui.includes("eq('organization_id',organizationId)"));
assert(ui.includes("eq('entity_id',orderId)"));
assert(!/\.rpc\s*\(|\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/.test(ui),
  'handoff/readiness visualization must contain no database writes');
console.log('workshop-order-p2-handoff-timeline.test.ts: PASS');
console.log('WOS_P2_HANDOFF_NEGATIVE_CASES='+negative.length);
console.log('WOS_P2_HANDOFF_READONLY_AND_NO_START=PASS');
