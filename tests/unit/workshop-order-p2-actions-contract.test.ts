import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canActOnWosP2, isWosP2QaMutationEnabled, isWosP2RpcResult,
  parseWosP2Action, wosP2RpcArgs,
} from '../../src/lib/workshop-orders/p2-action-contract';

const orderId='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';
const valid={
  orderId,expectedVersion:2,requestId,
  note:'QA车间核对资料并确认后续步骤',
};
const accept=parseWosP2Action({...valid,action:'ACCEPT'});
assert(accept&&accept.action==='ACCEPT');
assert.equal(wosP2RpcArgs(accept).p_order_id,orderId);
assert.equal(wosP2RpcArgs(accept).p_resource_type,null);
const returned=parseWosP2Action({...valid,action:'RETURN_FOR_INFORMATION'});
assert(returned&&returned.action==='RETURN_FOR_INFORMATION');
const material=parseWosP2Action({
  ...valid,action:'CONFIRM_MATERIAL',
  resourceType:'INCOMING_MATERIAL',
  resourceStatus:'QUANTITY_VERIFIED',
  quantityExpected:100,quantityArrived:110,
});
assert(material&&material.action==='CONFIRM_MATERIAL');
assert.equal(wosP2RpcArgs(material).p_quantity_arrived,110);

for(const role of ['admin','manager','operator'])assert(canActOnWosP2(role));
for(const role of ['viewer','sales','anonymous','workshop','technician',undefined,null])assert(!canActOnWosP2(role));
for(const env of [
  {vercelEnv:'production',flag:'true',supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co'},
  {vercelEnv:'preview',flag:'false',supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co'},
  {vercelEnv:'preview',flag:'true',supabaseUrl:'https://amqpvxrurenevniilhtl.supabase.co'},
  {vercelEnv:'preview',flag:'true',supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co.evil.test'},
  {vercelEnv:'preview',flag:'true',supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co/rest/v1'},
  {vercelEnv:'preview',flag:'true',supabaseUrl:'http://xulmpqaknlwqqculbsek.supabase.co'},
  {vercelEnv:undefined,flag:'true',nodeEnv:'development',supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co'},
])assert(!isWosP2QaMutationEnabled(env),'must deny env '+JSON.stringify(env));
assert(isWosP2QaMutationEnabled({
  vercelEnv:'preview',flag:'true',
  supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co',
}));

const bad:Array<[string,unknown]>=[
 ['unknown action',{...valid,action:'START'}],
 ['direct production action',{...valid,action:'IN_PRODUCTION'}],
 ['attacker role',{...valid,action:'ACCEPT',role:'admin'}],
 ['attacker org',{...valid,action:'ACCEPT',organization_id:orderId}],
 ['attacker status',{...valid,action:'ACCEPT',workflow_status:'IN_PRODUCTION'}],
 ['attacker owner',{...valid,action:'ACCEPT',project_owner_profile_id:orderId}],
 ['extra field',{...valid,action:'ACCEPT',resourceType:'FILM'}],
 ['uuid',{...valid,orderId:'wrong',action:'ACCEPT'}],
 ['request uuid',{...valid,requestId:'wrong',action:'ACCEPT'}],
 ['version float',{...valid,expectedVersion:2.1,action:'ACCEPT'}],
 ['version zero',{...valid,expectedVersion:0,action:'ACCEPT'}],
 ['note empty',{...valid,note:' ',action:'ACCEPT'}],
 ['note short',{...valid,note:'short',action:'ACCEPT'}],
 ['resource mismatch',{...valid,action:'CONFIRM_MATERIAL',resourceType:'FILM',resourceStatus:'FIT_VERIFIED',quantityExpected:null,quantityArrived:null}],
 ['resource fake',{...valid,action:'CONFIRM_MATERIAL',resourceType:'BAD',resourceStatus:'ARRIVED',quantityExpected:null,quantityArrived:null}],
 ['film quantity',{...valid,action:'CONFIRM_MATERIAL',resourceType:'FILM',resourceStatus:'ARRIVED',quantityExpected:100,quantityArrived:100}],
 ['incoming missing qty',{...valid,action:'CONFIRM_MATERIAL',resourceType:'INCOMING_MATERIAL',resourceStatus:'ARRIVED',quantityExpected:null,quantityArrived:null}],
 ['incoming negative',{...valid,action:'CONFIRM_MATERIAL',resourceType:'INCOMING_MATERIAL',resourceStatus:'ARRIVED',quantityExpected:100,quantityArrived:-1}],
 ['incoming fractional',{...valid,action:'CONFIRM_MATERIAL',resourceType:'INCOMING_MATERIAL',resourceStatus:'ARRIVED',quantityExpected:100.5,quantityArrived:101}],
 ['incoming not verified',{...valid,action:'CONFIRM_MATERIAL',resourceType:'INCOMING_MATERIAL',resourceStatus:'QUANTITY_VERIFIED',quantityExpected:100,quantityArrived:99}],
 ['incoming zero verified',{...valid,action:'CONFIRM_MATERIAL',resourceType:'INCOMING_MATERIAL',resourceStatus:'QUANTITY_VERIFIED',quantityExpected:0,quantityArrived:0}],
];
for(const [why,value] of bad)assert.equal(parseWosP2Action(value),null,why);
assert.equal(isWosP2RpcResult({
  status:'APPLIED',orderId,version:3,requestId,workflowStatus:'WORKSHOP_REVIEW',
},accept),true);
assert.equal(isWosP2RpcResult({
  status:'APPLIED',orderId,version:3,requestId,workflowStatus:'IN_PRODUCTION',
},accept),false);
assert.equal(isWosP2RpcResult({
  status:'REPLAYED',orderId,version:4,requestId,workflowStatus:'WORKSHOP_REVIEW',
},accept),false);

const sql=readFileSync('docs/workshop-order-system/nonproduction-only/wos_p2_operator_actions_QA_ONLY_NOT_INSTALLED.sql','utf8');
const route=readFileSync('src/app/api/workshop-orders/p2/actions/route.ts','utf8');
const ui=readFileSync('src/components/workshop-orders/LiveQaWorkshopActions.tsx','utf8');
const server=readFileSync('src/lib/workshop-orders/api-server.ts','utf8');
for (const required of [
  'NOT INSTALLED','xulmpqaknlwqqculbsek','SECURITY DEFINER',"SET search_path = ''",
  'auth.uid()','wos_qa_p2_action_receipts','pg_advisory_xact_lock',
  'FOR UPDATE','IDEMPOTENCY_CONFLICT','VERSION_CONFLICT',
  'wos_status_history','wos_confirmations','wos_blockers','wos_resource_readiness',
  'REVOKE ALL ON FUNCTION','FROM PUBLIC,anon,authenticated',
  "'ACCEPT','RETURN_FOR_INFORMATION','CONFIRM_MATERIAL'",
  "AND i.workflow_status='SUBMITTED'",
  'version=version+1','SIGNED_SAMPLE','FILM_PATTERN','READY',
  'REQUIRED_VERIFIED_IMAGE_MISSING',
])assert(sql.includes(required),'SQL missing '+required);
assert(!/GRANT\s+(UPDATE|INSERT|DELETE)\s+ON\s+public\.wos_/i.test(sql),
  'no blanket table write grants');
assert(!/UPDATE\s+public\.wos_workshop_inbox/i.test(sql),
  'do not mutate immutable P1 submission projection');
assert(!/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]+TO\s+anon\s*;/i.test(sql),
  'no anonymous RPC executor');
assert(route.includes("WOS_P2_QA_MUTATIONS_ENABLED"));
assert(route.includes("isWosP2QaMutationEnabled"));
assert(route.includes("req.headers.get('origin')"));
assert(route.includes("req.headers.get('x-wos-p2-action')"));
assert(route.includes("resolveVerifiedSupabaseIdentity"));
assert(route.includes("canActOnWosP2"));
assert(route.includes("client.rpc('wos_qa_p2_operator_action'"));
assert(!route.includes("order.data.version!==request.expectedVersion"),
  'lost-response replay must reach atomic SQL ledger');
assert(ui.includes("NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED"));
assert(ui.includes("disabled={!canAttempt||!legal||sending}"));
assert(ui.includes('crypto.randomUUID()'));
assert(ui.includes('pendingRef.current?.key===key'));
assert(ui.includes("status:'IN_PRODUCTION'")===false);
assert(server.includes("for (const order of persistedRows)"));
assert(server.includes("task.source_revision + 1 > order.version"));
console.log('workshop-order-p2-actions-contract.test.ts: PASS');
console.log('WOS_P2_MUTATION_NEGATIVE_CASES='+bad.length);
console.log('WOS_P2_RLS_TRANSACTION_DESIGN_NOT_INSTALLED=PASS');
