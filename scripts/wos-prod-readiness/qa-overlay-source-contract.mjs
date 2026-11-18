// WOS QA-overlay source/route-RPC guard. No secrets, network, databases or writes.
// Code-reviewed SQL proposal only; a PASS does not authorize QA installation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const d='docs/workshop-order-system/nonproduction-only/wos-p0-02-02-qa-overlay/';
const sql=read(d+'03-qa-overlay-incremental-INSTALL_NOT_AUTHORIZED.sql');
const pre=read(d+'01-readonly-preflight.sql');
const post=read(d+'04-readonly-postflight.sql');
const rollback=read(d+'05-zero-write-rollback-NOT_AUTHORIZED.sql');
const edge=read('supabase/functions/wos-mvp-verify-image-candidate/index.ts');
const pages=read('src/components/workshop-orders/WosMvpOfficeCandidatePanel.tsx');
const routeNames=['cpc-options','candidate-drafts','candidate-office-document',
  'candidate-image-register','candidate-submit'];
const routes=routeNames.map(name=>read('src/app/api/workshop-orders/production/'+name+'/route.ts'));
const names=[
 'wos_mvp_create_cpc_draft_candidate',
 'wos_mvp_save_complete_office_candidate',
 'wos_mvp_register_image_candidate',
 'wos_mvp_submit_first_order_full_candidate',
 'wos_mvp_storage_snapshot_candidate',
 'wos_mvp_commit_image_proof_candidate',
];
for(const name of names)assert(sql.includes('CREATE FUNCTION public.'+name+'('),'missing RPC '+name);
for(const [i,name] of [[1,names[0]],[2,names[1]],[3,names[2]],[4,names[3]]])
 assert(routes[i].includes("rpc('"+name+"'"),'route-RPC mismatch '+routeNames[i]+' '+name);
for(const name of names.slice(4))
 assert(edge.includes("'"+name+"'"),'Edge-RPC mismatch '+name);
for(const path of ['candidate-drafts','candidate-office-document','candidate-image-register','candidate-submit']){
 const s=routes[routeNames.indexOf(path)];
 assert(s.includes('isWosCpcReadCandidateEnabled'),'missing QA Preview gate '+path);
 assert(!/service_role|SUPABASE_SECRET_KEYS/.test(s),'client route secret abuse '+path);
}
for(const t of [
 'CREATE SCHEMA wos_mvp_qa;','CREATE TABLE wos_mvp_qa.p1_execution_gate',
 "VALUES(true,false,'NOT_AUTHORIZED')",
 'WOS_QA_OVERLAY_P1_OWNER_GATE_NOT_OPEN',
 'WOS_QA_OVERLAY_P2_GATE_CONFLICT',
 'CREATE TABLE wos_mvp_qa.cpc_order_bindings',
 'PERFORM wos_mvp_qa.assert_cpc_link',
 'CREATE TABLE wos_mvp_attestation.private_image_proofs',
 'CREATE TABLE wos_mvp_attestation.office_document_receipts',
 'ALTER TABLE public.wos_production_orders ADD COLUMN follow_up_batch_plan text;',
 'wos_mvp_submit_first_order_full_candidate',
 'obj.version IS NOT DISTINCT FROM proof.storage_object_version',
 'proof.order_version=v_order.version',
 'OFFICE_FORM_FIELD_SET_MISMATCH',
]) assert(sql.includes(t),'missing failclosed SQL contract '+t);
assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);
assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
assert(!/CREATE TABLE public\.wos_|DROP TABLE public\.wos_|DROP TRIGGER wos_qa_|ALTER COLUMN customer_id SET NOT NULL|ALTER COLUMN project_id SET NOT NULL|REVOKE ALL ON storage\.objects|GRANT ALL ON storage\.objects/.test(sql));
assert(!sql.includes('synthetic_private_image_proofs'));
assert(!sql.includes('wos.p0_01_ephemeral_rehearsal'));
assert(!sql.includes('CREATE POLICY wos_mvp_candidate_private_upload'));
for(const f of [pre,post,rollback]){
 assert(!/\bGRANT\b.*\bservice_role\b/i.test(f));
}
for(const keyword of ['WOS_LEGACY_ORDER_BASELINE_CHANGED','WOS_QA_V7_SENTINEL_CHANGED',
 'WOS_P2_GATES_NOT_OFF','WOS_P7_RLS_POLICY_BASELINE_CHANGED']){
 assert(pre.includes(keyword),'missing preflight '+keyword);
}
assert(rollback.includes('WOS_OVERLAY_LIVE_DATA_EXISTS_USE_FORWARD_FIX'));
assert(!rollback.includes(' CASCADE'));
assert(rollback.includes('DROP SCHEMA wos_mvp_attestation RESTRICT'));
assert(!/DROP TABLE public\.wos_/.test(rollback));
for(const evidence of ['wos-private', "upsert:false",
 'INDEPENDENT_EDGE_BYTE_ATTESTATION_REQUIRED','candidate-submit']){
 assert(pages.includes(evidence),'Office UI path missing '+evidence);
}
for(const gate of ["ONLY_QA_URL", "WOS_MVP_IMAGE_CANDIDATE_ENABLED", "userDb.auth.getUser(token)",
 "userDb.storage.from(IMAGE_BUCKET)","pngValid(bytes,body.sha256)",
 "sameStorageObject(before,after)","await check()"])
 assert(edge.includes(gate),'Edge trust chain missing '+gate);
console.log('WOS_QA_OVERLAY_FRONTEND_BACKEND_RPC_CONTRACT=PASS');
console.log('WOS_QA_OVERLAY_DEFAULT_OFF_NEW_OBJECT_ONLY=PASS');
