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
// Direct authenticated RPC remains callable: this is not production-grade
// cryptographic proof binding. Production release stays blocked.

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
