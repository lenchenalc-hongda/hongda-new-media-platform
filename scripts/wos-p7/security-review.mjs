/**
 * WOS P7 dependency-free, secret-free, deterministic security preflight.
 * This is a CI technical guard, NOT an independent AI/human approval or
 * a substitute for real RLS, Auth, Storage and browser tests.
 * No outbound requests, secrets, production data or database writes.
 */
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const api = read('src/lib/workshop-orders/api-server.ts');
const contract = read('src/lib/workshop-orders/api-contract.ts');
const submission = read('src/lib/workshop-orders/p7-nonprod-submit.ts');
const component = read('src/components/workshop-orders/LiveQaProductionSubmit.tsx');
const recovery = read('src/lib/workshop-orders/qa-recovery.ts');
const atomic = read('docs/workshop-order-system/nonproduction-only/wos_p7_atomic_submission.sql');
const storage = read('docs/workshop-order-system/nonproduction-only/wos_p7_private_storage.sql');
const reader = read('docs/workshop-order-system/nonproduction-only/wos_p7_reader_role_hardening.sql');
const gatedQaWorkflow = read('.github/workflows/wos-qa-real-browser-click-e2e.yml');
const releaseGate = read('docs/workshop-order-system/nonproduction-only/wos_p7_preview_http_release_gate_20261108.md');

let failures = 0;
function gate(id, predicate) {
  if (!/^[A-Z0-9_]{4,64}$/.test(id)) throw new Error('INVALID_GATE_ID');
  const pass = Boolean(predicate);
  console.log('WOS_P7_STATIC_' + id + '=' + (pass ? 'PASS' : 'FAIL'));
  if (!pass) failures++;
}
function definer(text, name) {
  const start = text.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
  if (start < 0) return '';
  const end = text.indexOf('END $fn$;', start);
  return end < 0 ? '' : text.slice(start, end);
}

gate('PREVIEW_PINNED_TO_NONPRODUCTION', contract.includes("WOS_P5C_SANDBOX_REF = 'xulmpqaknlwqqculbsek'")
  && contract.includes("input.vercelEnv === 'production') return false")
  && contract.includes("input.enabled !== 'true'")
  && api.includes('isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)')
  && api.includes("if (!enabled()) return response('NONPRODUCTION_ONLY_DISABLED', 503)"));
gate('SUBMISSION_FAILS_CLOSED', submission.includes("process.env.VERCEL_ENV !== 'production'")
  && submission.includes('isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)')
  && submission.includes("client.rpc('wos_submit_production_order'")
  && !submission.includes('service_role')
  && !submission.includes('.upsert('));
gate('SERVER_AUTHORIZED_SUBMIT', api.includes('resolveVerifiedSupabaseIdentity')
  && api.includes("client.from('profiles')")
  && api.includes("!canSubmitWosOfficeRequest(auth.actor.role)")
  && api.includes("process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true'"));
gate('QA_CLIENT_IMAGE_AND_IDEMPOTENCY', component.includes('verifyQaImageSignature')
  && component.includes('idempotencyKey')
  && component.includes("if (officeAuthorized !== true)")
  && !component.includes('SUPABASE_SERVICE_ROLE_KEY'));
gate('QA_RECOVERY_SCOPED_NO_SECRETS', recovery.includes("WOS_QA_RECOVERY_KEY + userId + ':' + orgId")
  && recovery.includes('window.localStorage.setItem')
  && recovery.includes('MAX_AGE_MS = 24 * 60 * 60 * 1000')
  && recovery.includes('isValidQaRecovery(parsed, userId, orgId, Date.now())')
  && !recovery.includes('access_token:') && !recovery.includes('refresh_token:'));

for (const [name, sql] of [
  ['wos_confirm_office_completeness', atomic],
  ['wos_submit_production_order', atomic],
  ['wos_register_uploaded_reference_image', storage],
]) {
  const f = definer(sql, name);
  gate('SQL_' + name.replace(/^wos_/, '').toUpperCase() + '_AUTH',
    f.includes('SECURITY DEFINER') && /SET search_path\s*=\s*''/.test(f)
    && f.includes('auth.uid()')
    && f.includes("v_actor.org_id")
    && f.includes('NOT_AUTHORIZED'));
  gate('SQL_' + name.replace(/^wos_/, '').toUpperCase() + '_ANON_DENIED',
    sql.includes('REVOKE ALL ON FUNCTION public.' + name)
    && sql.includes('FROM PUBLIC,anon,authenticated;')
    && sql.includes('GRANT EXECUTE ON FUNCTION public.' + name));
}

gate('ATOMIC_RECEIPT_AND_INBOX', atomic.includes('idempotency_key uuid NOT NULL UNIQUE')
  && atomic.includes('UNIQUE(order_id,source_revision)')
  && atomic.includes('INSERT INTO public.wos_workshop_inbox')
  && atomic.includes('INSERT INTO public.wos_status_history')
  && atomic.includes("USING ERRCODE='PT409'"));
gate('PRIVATE_STORAGE_BOUND_TO_ACTOR', storage.includes("VALUES('wos-private','wos-private',false,20971520")
  && storage.includes("owner_id=auth.uid()::text")
  && storage.includes('wos_p7_private_object_insert')
  && storage.includes('wos_p7_private_object_select')
  && storage.includes('p.org_id::text=(storage.foldername(name))[2]')
  && storage.includes("REVOKE INSERT ON public.wos_reference_images FROM authenticated"));
gate('RESTRICTIVE_READ_ROLE_RLS', (reader.match(/AS RESTRICTIVE FOR SELECT TO authenticated/g) ?? []).length >= 7
  && reader.includes("bucket_id IS DISTINCT FROM 'wos-private'")
  && reader.includes("p.role IN ('admin','manager','sales','operator','workshop','technician')"));

// Guard against later accidental widening of office reference-image privileges.
const uploadPolicy = storage.split('CREATE POLICY wos_p7_private_object_insert')[1]
  ?.split('CREATE POLICY wos_p7_private_object_select')[0] ?? '';
const readPolicy = storage.split('CREATE POLICY wos_p7_private_object_select')[1]
  ?.split('CREATE OR REPLACE FUNCTION')[0] ?? '';
const registerRpc = definer(storage,'wos_register_uploaded_reference_image');
const qaHardening = read('docs/workshop-order-system/nonproduction-only/wos_p7_security_hardening_20261108.sql');
const httpVerifier = read('src/app/api/workshop-orders/qa-image-verify/route.ts');
const binaryVerifier = read('src/lib/workshop-orders/qa-image-validation.ts');
gate('NO_OPERATOR_REFERENCE_UPLOAD', uploadPolicy.includes("p.role IN ('admin','manager','sales')")
  && !uploadPolicy.includes("p.role IN ('admin','manager','sales','operator')")
  && uploadPolicy.includes("po.workflow_status='DRAFT'"));
gate('POST_SUBMIT_IMAGE_REGISTRATION_DENIED', registerRpc.includes("role IN ('admin','manager','sales')")
  && !registerRpc.includes("role IN ('admin','manager','sales','operator')")
  && registerRpc.includes("v_order.workflow_status <> 'DRAFT'"));
gate('OPERATOR_READS_SUBMITTED_ONLY', readPolicy.includes("p.role IN ('operator','workshop','technician') AND po.workflow_status='SUBMITTED'"));
gate('QA_HARDENING_MIGRATION_PARITY', qaHardening.includes('WOS_NONPRODUCTION_SYNTHETIC_DATA_REQUIRED')
  && qaHardening.includes("po.workflow_status='DRAFT'")
  && qaHardening.includes("v_order.workflow_status <> 'DRAFT'"));
gate('QA_SERVER_BINARY_VERIFICATION', httpVerifier.includes('resolveVerifiedSupabaseIdentity')
  && httpVerifier.includes('isApprovedWosSandboxUrl')
  && httpVerifier.includes("order.data.workflow_status!=='DRAFT'")
  && httpVerifier.includes("client.storage.from('wos-private').download(expected)")
  && httpVerifier.includes('verifyWosSyntheticPngBinary(binary,x.sha256)')
  && binaryVerifier.includes("inflateSync(Buffer.concat(compressed)")
  && binaryVerifier.includes('crc32(buf.subarray(offset+4,dataEnd))')
  && component.includes("fetch('/api/workshop-orders/qa-image-verify'"));
// The authenticated RPC must now check an Edge-minted DB proof.
// This technical check is not independent QA browser approval or release authorization.

const trustedSql=read('docs/workshop-order-system/nonproduction-only/wos_p7_trusted_binary_proof_20261108.sql');
const trustedReadySql=read('docs/workshop-order-system/nonproduction-only/wos_p7_qa_trusted_readiness_20261108.sql');
const edge=read('supabase/functions/wos-p7-verify-image/index.ts');
const nextVerify=read('src/app/api/workshop-orders/qa-image-verify/route.ts');
gate('ATTESTATION_PRIVATE_TO_SERVER',trustedSql.includes('CREATE TABLE public.wos_qa_verified_image_proofs')
  &&trustedSql.includes('ENABLE ROW LEVEL SECURITY')
  &&trustedSql.includes('REVOKE ALL ON public.wos_qa_verified_image_proofs FROM PUBLIC,anon,authenticated')
  &&trustedSql.includes('QA_TRUSTED_BINARY_PROOF_REQUIRED')
  &&trustedSql.includes('proof.actor_user_id=auth.uid()')
  &&trustedSql.includes('proof.storage_object_id=v_object.id')
  &&trustedSql.includes('proof.expires_at>clock_timestamp()'));
gate('READY_REQUIRES_TRUSTED_BINARY',trustedReadySql.includes('TRUSTED_PRIVATE_IMAGE_REQUIRED')
  &&trustedReadySql.includes('JOIN public.wos_qa_verified_image_proofs proof')
  &&trustedReadySql.includes('JOIN storage.objects obj'));
gate('EDGE_ATTESTATION_PINNED_AND_CHECKED',
  edge.includes("QA_URL='https://xulmpqaknlwqqculbsek.supabase.co'")
  &&edge.includes('await userDb.auth.getUser(token)')
  &&edge.includes('await pngValid(bytes')
  &&edge.includes("userDb.storage.from('wos-private').download(path)")
  &&edge.includes("admin.rpc('wos_qa_get_storage_object_for_proof'")
  &&edge.includes("admin.from('wos_qa_verified_image_proofs').upsert")
  &&nextVerify.includes("client.functions.invoke('wos-p7-verify-image'"));

const orphanClaims=read('docs/workshop-order-system/nonproduction-only/wos_p7_qa_orphan_claims_20261108.sql');
const orphanReconcile=read('docs/workshop-order-system/nonproduction-only/wos_p7_qa_cleanup_reconciliation_20261108.sql');
const orphanRace=read('docs/workshop-order-system/nonproduction-only/wos_p7_qa_cleanup_race_guards_20261108.sql');
const orphanParity=read('docs/workshop-order-system/nonproduction-only/wos_p7_qa_orphan_inventory_parity_20261108.sql');
const orphanScoped=read('docs/workshop-order-system/nonproduction-only/wos_p7_qa_scoped_cleanup_claim_20261108.sql');
const orphanScopedInventory=read('docs/workshop-order-system/nonproduction-only/wos_p7_qa_scoped_orphan_inventory_20261108.sql');
const orphanEdge=read('supabase/functions/wos-p7-orphan-cleanup/index.ts');
gate('ORPHAN_LEASED_EXCLUSIVE_AND_PROOF_SERIALIZED',
  orphanClaims.includes('wos_qa_claim_stale_orphan_for_org')
  && orphanClaims.includes('FOR UPDATE OF so,po SKIP LOCKED')
  && orphanClaims.includes('wos_qa_predelete_orphan')
  && orphanClaims.includes('wos_qa_finish_orphan_claim')
  && orphanClaims.includes('wos_qa_proof_write_guard')
  && orphanClaims.includes('wos_qa_trusted_proof_guard')
  && orphanClaims.includes('STORAGE_BINARY_METADATA_STILL_PRESENT')
  && orphanClaims.includes('REVOKE ALL ON public.wos_qa_orphan_cleanup_claims'));
gate('ORPHAN_ORGANIZATION_SCOPE',
  orphanScoped.includes('wos_qa_claim_stale_orphan_for_org')
  && orphanScoped.includes('po.organization_id=p_organization_id')
  && orphanScopedInventory.includes('wos_qa_list_stale_orphans_for_org')
  && orphanScopedInventory.includes('po.organization_id=p_organization_id')
  && orphanEdge.includes("admin.rpc('wos_qa_claim_stale_orphan_for_org'")
  && orphanEdge.includes("admin.rpc('wos_qa_list_stale_orphans_for_org'"));
gate('ORPHAN_LEASE_RECOVERY_FAIL_CLOSED',
  orphanReconcile.includes('wos_qa_reconcile_expired_cleanup_claims')
  && orphanReconcile.includes('RECONCILED_METADATA_ABSENT_AFTER_LEASE')
  && orphanReconcile.includes('RECONCILED_METADATA_PRESENT_AFTER_LEASE')
  && orphanEdge.includes("'wos_qa_reconcile_expired_cleanup_claims'"));
gate('ORPHAN_DRY_RUN_MATCHES_CLAIM',
  orphanParity.includes("po.workflow_status IN ('DRAFT','SUBMITTED')")
  && orphanParity.includes('wos_qa_orphan_cleanup_claims')
  && orphanParity.includes('wos_qa_verified_image_proofs')
  && orphanParity.includes('wos_reference_images'));
gate('ORPHAN_REGISTER_SUBMIT_BLOCKED_DURING_CLAIM',
  orphanRace.includes('CREATE OR REPLACE FUNCTION public.wos_register_uploaded_reference_image(')
  && orphanRace.includes('CREATE OR REPLACE FUNCTION public.wos_submit_production_order(')
  && orphanRace.includes('CREATE OR REPLACE FUNCTION public.wos_qa_get_storage_object_for_proof(')
  && (orphanRace.match(/QA_ORPHAN_CLEANUP_IN_PROGRESS/g)??[]).length>=3);
gate('ORPHAN_WORKER_DEFAULTS_TO_NO_DELETE',
  orphanEdge.includes("QA_URL='https://xulmpqaknlwqqculbsek.supabase.co'")
  && orphanEdge.includes("profile.role!=='admin'")
  && orphanEdge.includes("const mode=body.mode??'dry_run'")
  && orphanEdge.includes("WOS_P7_QA_ORPHAN_DELETE_ENABLED")
  && orphanEdge.includes("WOS_QA_SYNTHETIC_ORPHAN_DELETE_ONLY")
  && orphanEdge.includes("admin.rpc('wos_qa_predelete_orphan'")
  && orphanEdge.includes("admin.storage.from('wos-private').remove([claim.path])")
  && orphanEdge.includes("admin.rpc('wos_qa_finish_orphan_claim'"));
gate('BROWSER_QA_MANUAL_PROTECTED_ONLY',
  gatedQaWorkflow.includes('workflow_dispatch:')
  && gatedQaWorkflow.includes("WOS_QA_SOAK_ROUNDS: '10'")
  && gatedQaWorkflow.includes('environment: hongda-review-dev')
  && gatedQaWorkflow.includes("github.ref == 'refs/heads/qa/wos-nonprod-atomic-storage-20261107'")
  && !/^\s*push:\s*$/m.test(gatedQaWorkflow)
  && !/^\s*pull_request(_target)?:\s*$/m.test(gatedQaWorkflow));

const flowHeader = gatedQaWorkflow.slice(0, gatedQaWorkflow.indexOf('\njobs:'));
gate('QA_SECRETS_NOT_AUTO_ON_PUSH', /^\s*on:\s*\n\s*workflow_dispatch:\s*$/m.test(flowHeader)
  && !/^\s*push:\s*$/m.test(flowHeader)
  && !/^\s*pull_request(_target)?:\s*$/m.test(flowHeader)
  && gatedQaWorkflow.includes('environment: hongda-review-dev')
  && gatedQaWorkflow.includes('permissions:\n  contents: read')
  && gatedQaWorkflow.includes("github.ref == 'refs/heads/qa/wos-nonprod-atomic-storage-20261107'"));
gate('RELEASE_REMAINS_BLOCKED', releaseGate.includes('NOT READY FOR PRODUCTION')
  && (releaseGate.includes('independent') || releaseGate.includes('独立 Reviewer')));
gate('NO_PRODUCTION_DEPLOY_STEPS', !/\bvercel\s+--prod\b|\bvercel\s+promote\b|\bsupabase\s+db\s+push\b/.test(gatedQaWorkflow));
if (failures) {
  console.error('WOS_P7_STATIC_SECURITY_AUDIT=FAIL');
  process.exitCode = 1;
} else {
  console.log('WOS_P7_STATIC_SECURITY_AUDIT=PASS_TECHNICAL_ONLY');
  console.log('WOS_P7_INDEPENDENT_HUMAN_APPROVAL=PENDING');
  console.log('WOS_P7_PRODUCTION_RELEASE=BLOCKED');
}
