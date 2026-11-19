// Non-production, no-secret schema proposal verifier. No database/network access.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const root = new URL('../../', import.meta.url);
const file = path => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(file('docs/workshop-order-system/production-readiness/p0-01-object-contract.json'));
const sql = file('docs/workshop-order-system/production-readiness/wos_mvp_receipts_PROPOSAL_NOT_INSTALLED.sql');
const tables = [
  'wos_office_readiness_receipts', 'wos_submission_receipts', 'wos_workshop_inbox',
  'wos_operator_action_receipts','wos_office_revision_receipts','wos_operator_review_receipts'
];
function must(regex,source=sql,message=String(regex)){ assert.match(source,regex,message); }
function mustNot(regex,source=sql,message=String(regex)){ assert.doesNotMatch(source,regex,message); }
assert.equal(manifest.status,'PROPOSAL_ONLY_NOT_AUTHORIZED_FOR_PRODUCTION');
assert.equal(manifest.project.production_id,'amqpvxrurenevniilhtl');
assert.equal(manifest.project.qa_id,'xulmpqaknlwqqculbsek');
assert.deepEqual(manifest.status_scope.allowed,
  ['DRAFT','SUBMITTED','WORKSHOP_REVIEW','NEEDS_INFORMATION','WAITING_MATERIAL']);
assert(!manifest.status_scope.allowed.some(s=>manifest.status_scope.never_enable.includes(s)));
assert.equal(tables.length,6);
assert.equal((sql.match(/^CREATE TABLE public\.wos_/gm)||[]).length,tables.length);
assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);
assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
must(/WOS_PROPOSAL_ONLY_NO_HOSTED_EXECUTION/);
must(/current_setting\('wos\.p0_01_ephemeral_rehearsal'/);
must(/wos_mvp_order_id_org_unique/);
must(/UNIQUE\(organization_id,idempotency_key\)/);
must(/UNIQUE\(order_id\), -- initial P1 submission is immutable/);
must(/CHECK\(workflow_status='SUBMITTED'\)/);
must(/FOREIGN KEY\s*\(submission_id,organization_id,order_id\)/);
must(/FOREIGN KEY\(office_revision_request_id,organization_id,order_id\)/);
must(/FOREIGN KEY\s*\(order_id,organization_id\)/);
mustNot(/CREATE\s+(?:TABLE|FUNCTION|POLICY)\s+[^;]*\bwos_qa_/i);
mustNot(/\bUPDATE\s+(?:public|storage)\./i);
mustNot(/\bGRANT\s+(?:ALL|INSERT|UPDATE|DELETE|TRUNCATE)\s+ON\b/i);
mustNot(/\bSECURITY\s+DEFINER\b/i);
mustNot(/\bservice_role\b/i);
mustNot(/wos_qa_p2_|QA-NONPROD-|QA-CPC-NONPROD-/i);
mustNot(/(?:READY_TO_START|IN_PRODUCTION|PRODUCTION_COMPLETED|READY_FOR_SHIPMENT)/);
mustNot(/(?:amqpvxrurenevniilhtl|xulmpqaknlwqqculbsek)/);
for(const name of tables){
  must(new RegExp('CREATE TABLE public\\.'+name+'\\s*\\('));
  must(new RegExp('ALTER TABLE public\\.'+name+' ENABLE ROW LEVEL SECURITY;'));
  must(new RegExp('GRANT SELECT ON[\\s\\S]{0,350}public\\.'+name+'[\\s\\S]{0,350}TO authenticated;'));
}
const policies=(sql.match(/^CREATE POLICY wos_mvp_/gm)||[]);
assert.equal(policies.length,6,'each receipt/inbox table requires its own RLS policy');
must(/p\.user_id=auth\.uid\(\) AND p\.is_active/);
must(/p\.org_id=organization_id/);
mustNot(/\brole\s+IN\([^)]*'viewer'/i);
const required = new Set(manifest.required_core.map(x=>x.object));
for(const name of tables)assert(required.has('public.'+name),'manifest missing '+name);
console.log('WOS_P0_01_DENY_BY_DEFAULT_SOURCE_GUARD=PASS');
console.log('WOS_P0_01_PRODUCTION_MUTATIONS=ZERO');
