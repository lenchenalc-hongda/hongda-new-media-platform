import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  canWosOfficeRevise,isWosP2OfficeRpcResult,
  isWosP2QaOfficeRevisionEnabled,parseWosP2OfficeRevision,
  wosP2OfficeRpcArgs,
} from '../../src/lib/workshop-orders/p2-office-revision-contract';

const orderId='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';
const core={
  orderId,expectedVersion:4,requestId,
  reason:'QA customer acceptance requirement now verified',
};
const save=parseWosP2OfficeRevision({...core,
  action:'SAVE_CORRECTION',patch:{productName:'Corrected sample',requestedQuantity:100}});
assert(save && save.action==='SAVE_CORRECTION');
assert.equal(wosP2OfficeRpcArgs(save).p_order_id,orderId);
const resubmit=parseWosP2OfficeRevision({...core,expectedVersion:5,
  action:'RESUBMIT_CORRECTION',patch:{}});
assert(resubmit && resubmit.action==='RESUBMIT_CORRECTION',
  'saved correction may resubmit with empty patch ONLY after SQL independently verifies receipt');
assert.equal(parseWosP2OfficeRevision({...core,action:'SAVE_CORRECTION',patch:{}}),null);
assert.equal(parseWosP2OfficeRevision({...core,action:'SAVE_CORRECTION',
  patch:{organizationId:orderId}}),null);
assert.equal(parseWosP2OfficeRevision({...core,action:'SAVE_CORRECTION',
  patch:{versionLabel:'V100'}}),null);
assert.equal(parseWosP2OfficeRevision({...core,action:'SAVE_CORRECTION',
  patch:{currentBatchQuantity:200,requestedQuantity:100}}),null);
assert.equal(parseWosP2OfficeRevision({...core,action:'SAVE_CORRECTION',
  patch:{productName:'  '}}),null);
assert.equal(parseWosP2OfficeRevision({...core,action:'RESUBMIT_CORRECTION',
  patch:{workflowStatus:'READY_TO_START'}}),null);
assert(save);
assert(isWosP2OfficeRpcResult({status:'UPDATED',orderId,requestId,version:5,
  workflowStatus:'NEEDS_INFORMATION'},save));
assert(!isWosP2OfficeRpcResult({status:'UPDATED',orderId,requestId,version:6,
  workflowStatus:'NEEDS_INFORMATION'},save));
assert(resubmit);
assert(isWosP2OfficeRpcResult({status:'RESUBMITTED',orderId,requestId,version:6,
  workflowStatus:'WORKSHOP_REVIEW'},resubmit));
assert(!isWosP2OfficeRpcResult({status:'RESUBMITTED',orderId,requestId,version:6,
  workflowStatus:'IN_PRODUCTION'},resubmit));
for (const role of ['admin','manager','sales']) assert(canWosOfficeRevise(role));
for (const role of ['operator','viewer',null,'anonymous']) assert(!canWosOfficeRevise(role));
for (const bad of [
  {vercelEnv:'production',flag:'true',supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co'},
  {vercelEnv:'preview',flag:'false',supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co'},
  {vercelEnv:'preview',flag:'true',supabaseUrl:'https://amqpvxrurenevniilhtl.supabase.co'},
  {vercelEnv:'preview',flag:'true',supabaseUrl:'http://xulmpqaknlwqqculbsek.supabase.co'},
]) assert(!isWosP2QaOfficeRevisionEnabled(bad));
assert(isWosP2QaOfficeRevisionEnabled({vercelEnv:'preview',flag:'true',
  supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co'}));
assert(!isWosP2QaOfficeRevisionEnabled({vercelEnv:'preview',nodeEnv:'development',
  flag:'true',supabaseUrl:'http://127.0.0.1:55421'}));
assert(isWosP2QaOfficeRevisionEnabled({vercelEnv:'preview',nodeEnv:'development',
  flag:'true',supabaseUrl:'http://127.0.0.1:55421',allowLocal:'true'}));
assert(!isWosP2QaOfficeRevisionEnabled({vercelEnv:'preview',nodeEnv:'production',
  flag:'true',supabaseUrl:'http://127.0.0.1:55421',allowLocal:'true'}));

const sql=readFileSync('docs/workshop-order-system/nonproduction-only/wos_p2_office_revision_resubmit_QA_ONLY_NOT_INSTALLED.sql','utf8');
const route=readFileSync('src/app/api/workshop-orders/p2/office-revisions/route.ts','utf8');
const app=readFileSync('src/components/workshop-orders/LiveQaReturnedOrders.tsx','utf8');
const operator=readFileSync('src/app/api/workshop-orders/p2/actions/route.ts','utf8');
const api=readFileSync('src/lib/workshop-orders/api-server.ts','utf8');
for (const marker of [
  'QA-ONLY DESIGN','NOT INSTALLED','xulmpqaknlwqqculbsek',
  "SET search_path = ''",'SECURITY DEFINER','auth.uid()',
  'wos_qa_p2_office_execution_gate','wos_qa_p2_office_revisions',
  'wos_qa_p2_review_receipts','wos_qa_p2_review_correction',
  'pg_advisory_xact_lock','FOR UPDATE','IDEMPOTENCY_CONFLICT',
  "'SAVE_CORRECTION'","'RESUBMIT_CORRECTION'",
  "'REVIEW_CORRECTION'","'QA-R'",'newVersionLabel',
  "'P2_DOCUMENTS_INCOMPLETE'","status='RESOLVED'",
  'resolved_by_profile_id','original','before_snapshot','after_snapshot',
  'REVOKE ALL',
  "INTERVAL '15 minutes'",
  'allowed_order_id=p_order_id',
  'allowed_organization_id=',
]) assert(sql.includes(marker),'SQL missing essential marker: '+marker);
assert(!sql.includes("INTERVAL '24 hours'"),
  'legacy Office Gate must not retain a 24-hour window');
for(const marker of [
  'WOS_P2_QA_OFFICE_REVISION_ENABLED','resolveVerifiedSupabaseIdentity',
  'req.headers.get(\'origin\')','canWosOfficeRevise',
  "db.from('wos_production_orders')",
  "db.rpc('wos_qa_p2_office_revision'",
]) assert(route.includes(marker),'Office API gate missing '+marker);
assert(app.includes('writeEnabled'));
assert(!app.includes('NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED'));
assert(app.includes('replay.current?.fingerprint===fingerprint'));
assert(app.includes('disabled={!writeEnabled||pending}'));
assert(app.includes('重新提交车间复核'));
assert(operator.includes("client.rpc('wos_qa_p2_review_correction'"));
assert(api.includes('WORKSHOP_REVISION_UNVERIFIED'));
assert(api.includes('newVersionLabel'));
assert(!/GRANT\s+(UPDATE|INSERT|DELETE)\s+ON\s+public\.wos_/i.test(sql));
assert(!/UPDATE\s+public\.wos_workshop_inbox/i.test(sql));
console.log('WOS_P2_OFFICE_REVISION_CONTRACT=PASS');
console.log('WOS_P2_OPERATOR_REVIEW_BOUND_TO_REVISION=PASS');
console.log('WOS_P2_NO_PRODUCTION_SCHEMA_OR_BROAD_GRANTS=PASS');
