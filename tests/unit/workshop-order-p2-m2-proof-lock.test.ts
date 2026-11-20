import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Repository source guards only. SQL must ALSO run on an isolated real PG17.
const path='docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql';
const sql=readFileSync(path,'utf8');
const exactly=(token:string,count:number,label:string)=>{
 assert.equal(sql.split(token).length-1,count,label);
};
exactly('CREATE OR REPLACE FUNCTION public.wos_qa_p2_m2_action(',1,'one atomic RPC');
exactly('CREATE OR REPLACE FUNCTION public.wos_qa_p2_m2_checked_proof_set(',1,'one canonical proof verifier');
exactly('COMMIT;',1,'one single transaction');
exactly('CREATE UNIQUE INDEX IF NOT EXISTS wos_p2_m2_one_current_baseline',1,'one CURRENT baseline');
exactly("PERFORM 1 FROM public.wos_qa_p2_m2_checked_proof_set(",1,'SELECT checks canonical proof');
exactly('FROM public.wos_qa_p2_m2_checked_proof_set(',4,'SELECT/OFFICE/WORKSHOP/FINAL share verifier');
for(const token of [
 'NOT INSTALLED','NOT AUTHORIZED','M2_OPERATOR_WRITES','M2_OFFICE_WRITES',
 'pg_advisory_xact_lock','FOR UPDATE','FOR SHARE OF bi,im,pf,ob',
 'office_proof_set_digest','office_post_order_version',
 'workshop_proof_set_digest','workshop_post_order_version',
 'v_proof_digest IS DISTINCT FROM v_office_digest',
 'v_office_actor=v_actor.id','v_office_version<>p_expected_version',
 'v_workshop_version<>p_expected_version',
 'OR v_proof_digest IS DISTINCT FROM v_workshop_digest',
 'VERIFIED_IMAGE_PROOF_CHANGED',
 'storage.objects','ob.version=pf.storage_object_version',
 'ob.updated_at=pf.storage_object_updated_at',
 'ob.is_delete_marker IS DISTINCT FROM true',
 'pf.expires_at>pg_catalog.clock_timestamp()',
 "ARRAY['PRODUCT','FILM_PATTERN','SIGNED_SAMPLE','CUSTOMER_APPROVED_SAMPLE']",
 "'proofExpiresAt',expires_at","'proofVerifiedAt',verified_at",
 "'objectId',storage_object_id","'objectVersion',storage_object_version",
 "'numericOrderVersion',o.version",
 'IDEMPOTENCY_CONFLICT','VERSION_CONFLICT','PRODUCTION_VERSION_CONFLICT',
 "'canStart',false",'REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_action',
]) assert(sql.includes(token),'missing safeguard: '+token);
assert(!/^\s*GRANT\s+EXECUTE\s+ON\s+FUNCTION\b/m.test(sql),
 'Do not grant executable RPC in this uninstalled proposal');
assert(!/^\s*EXECUTE\s+\w+\s*\(/mi.test(sql),'no dynamic execution');
assert(!sql.includes("'canStart',true"),'no automatic production authority');
assert(sql.indexOf('office_proof_set_digest=v_proof_digest') <
 sql.lastIndexOf('v_proof_digest IS DISTINCT FROM v_office_digest'),
 'Office signature must precede Workshop compare');
console.log('workshop-order-p2-m2-proof-lock.test.ts: PASS');
console.log('WOS_M2_P0_SOURCE_SECURITY_GUARDS=PASS');
console.log('WOS_M2_SQL_PG17_EXECUTION=SEPARATE_INDEPENDENT_GATE');
