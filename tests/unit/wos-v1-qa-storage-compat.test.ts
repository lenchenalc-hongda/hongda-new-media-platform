import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const install = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_STORAGE_COMPAT_INSTALL_NOT_AUTHORIZED.sql',
  'utf8',
);
const rollback = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/'
    + 'WOS_V1_QA_UAT_STORAGE_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql',
  'utf8',
);
const harness = readFileSync(
  'tests/sql/wos-v1-rc04-storage-api-smoke.mjs',
  'utf8',
);
const pg17 = readFileSync(
  'tests/sql/run-wos-v1-production-m2-qa-uat-pg17.sh',
  'utf8',
);
const livePolicySnapshot = JSON.parse(readFileSync(
  'docs/workshop-order-system/production-readiness/evidence/'
    + 'WOS_V1_QA_STORAGE_POLICY_LIVE_SNAPSHOT_20261128.json',
  'utf8',
));

assert.equal(
  livePolicySnapshot.wosFingerprint,
  'f9759e0644e82ff4264efa42ac54e57c',
);
assert.equal(
  livePolicySnapshot.nonWosFingerprint,
  'f64fe08ac8669875ee9f7f3d4bbbc60f',
);
assert.equal(livePolicySnapshot.policies.length, 6);

for (const marker of [
  "wos_v1.qa_storage_compat_install_authorized",
  "'xulmpqaknlwqqculbsek'",
  "WOS-V1-PRODUCTION-M2-QA-UAT-009",
  'wos_v1_qa_storage_compat.policy_backup',
  'wos_v1_qa_storage_compat.install_state',
  'wos_p7_private_object_insert',
  'wos_p7_private_object_select',
  'wos_p7_storage_reader_roles',
  'wos_qa_revision_object_insert',
  'WOS_V1_QA_UAT_STORAGE_SOURCE_POLICY_FINGERPRINT_MISMATCH',
  'f9759e0644e82ff4264efa42ac54e57c',
  'f64fe08ac8669875ee9f7f3d4bbbc60f',
  "current_setting('wos_v1.qa_storage_local_test', true) = 'yes'",
  "current_database() LIKE '%\\_ci' ESCAPE '\\'",
  'public.wos_v1_qa_storage_write_allowed',
  'public.wos_v1_qa_storage_read_allowed',
  "control.authorized_actor_profile_id = v_actor.id",
  "control.db_state = 'ARMED'",
  "control.edge_state = 'ARMED'",
  "control.write_deadline_at > clock_timestamp()",
  "control.db_last_heartbeat_at >",
  "control.edge_last_heartbeat_at >",
  "v_order.version_label = 'V1'",
  "v_order.workflow_status = 'DRAFT'",
  "v_order.version_label ~ '^V[2-9][0-9]{0,20}$'",
  "v_order.workflow_status = 'NEEDS_INFORMATION'",
  "v_order.workflow_status NOT IN (",
  "proof.proof_status = 'VERIFIED'",
  "proof.created_at >",
  "interval '600 seconds'",
  "proof.storage_object_version IS NOT DISTINCT FROM object.version",
  "proof.storage_object_updated_at",
  'wos_qa_uat_private_insert',
  'wos_qa_uat_private_insert_guard',
  'wos_qa_uat_private_select',
  'wos_qa_uat_private_select_guard',
  'AS RESTRICTIVE FOR INSERT',
  'AS RESTRICTIVE FOR SELECT',
  'TO anon, authenticated',
  'storage.filename(name) = \'source.png\'',
  'bucket_public',
  'bucket_file_size_limit',
  'bucket_allowed_mime_types',
  "SET allowed_mime_types = ARRAY['image/png']",
]) {
  assert(install.includes(marker), `Storage compat install missing ${marker}`);
}

assert(!install.includes('TO authenticated USING (true)'));
assert(!install.includes('GRANT SELECT ON wos_v1_qa_uat.closeout_controls'));
assert(!install.includes(
  'GRANT SELECT ON public.wos_qa_trusted_proof_receipts',
));
assert(!install.includes('DROP POLICY wos_p7_private_object_insert'));
assert(install.includes('EXECUTE format('));
assert(
  install.indexOf('CREATE SCHEMA wos_v1_qa_storage_compat')
    < install.indexOf('DROP POLICY %I ON storage.objects'),
);

for (const marker of [
  "wos_v1.qa_storage_compat_rollback_authorized",
  "'xulmpqaknlwqqculbsek'",
  'WOS_V1_QA_UAT_STORAGE_COMPAT_NOT_INSTALLED',
  'WOS_V1_QA_UAT_STORAGE_ACTIVE_POLICY_SET_MISMATCH',
  'DROP POLICY wos_qa_uat_private_insert ON storage.objects',
  'DROP POLICY wos_qa_uat_private_insert_guard ON storage.objects',
  'DROP POLICY wos_qa_uat_private_select ON storage.objects',
  'DROP POLICY wos_qa_uat_private_select_guard ON storage.objects',
  'DROP FUNCTION public.wos_v1_qa_storage_write_allowed',
  'DROP FUNCTION public.wos_v1_qa_storage_read_allowed',
  'WOS_V1_QA_UAT_STORAGE_ROLLBACK_FINGERPRINT_MISMATCH',
  'WOS_V1_QA_UAT_STORAGE_BUCKET_ROLLBACK_MISMATCH',
  'state.bucket_allowed_mime_types',
  "backup.permissive NOT IN ('PERMISSIVE', 'RESTRICTIVE')",
  "storage.objects AS %s",
  'backup.permissive',
  'v_state.source_policy_fingerprint',
  'v_state.non_wos_policy_fingerprint',
]) {
  assert(rollback.includes(marker), `Storage compat rollback missing ${marker}`);
}
assert(!rollback.includes('DROP POLICY commercial_'));
assert(!rollback.includes('DROP POLICY quotation_'));
assert(!rollback.includes(
  'CREATE POLICY %I ON storage.objects AS PERMISSIVE',
));
assert(
  rollback.indexOf('DROP POLICY wos_qa_uat_private_insert')
    < rollback.indexOf('DROP FUNCTION public.wos_v1_qa_storage_write_allowed'),
);

for (const marker of [
  "WOS_STORAGE_POLICY_MODE",
  "'qa_uat_compat'",
  'WOS_V1_QA_UAT_STORAGE_OFFICE_V2_UPLOAD=PASS',
  'WOS_V1_QA_UAT_STORAGE_OPERATOR_WAITING_MATERIAL=PASS',
  'WOS_V1_QA_UAT_STORAGE_OLD_VERSION_AND_PROOF_EXPIRY=PASS',
  'WOS_V1_QA_UAT_STORAGE_GATE_CLOSED_DENIAL=PASS',
  'WOS_V1_QA_UAT_STORAGE_POLICY_COMPOSITION=PASS',
  'wos_guard_test_authenticated_allow_all',
  "expectUploadDenied(\n      'ANON'",
  "expectReadDenied('ANON'",
  "expectUploadDenied(\n      'CROSS_ORG'",
  "expectUploadDenied(\n      'WRONG_CATEGORY'",
  "expectUploadDenied(\n      'WRONG_MIME'",
  "expectReadDenied('EXPIRED_PROOF'",
  "expectReadDenied('OLD_VERSION'",
]) {
  assert(harness.includes(marker), `Storage HTTP harness missing ${marker}`);
}

for (const marker of [
  'WOS_V1_QA_UAT_STORAGE_COMPAT_INSTALL_NOT_AUTHORIZED.sql',
  'WOS_V1_QA_UAT_STORAGE_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql',
  "WOS_STORAGE_POLICY_MODE='qa_uat_compat'",
  'QA_STORAGE_COMPAT_ROLLBACK_POLICY_MISMATCH',
  'QA_STORAGE_COMPAT_RESTRICTIVE_OR_GUARD_INVALID',
  "qa_shape_storage_policies",
]) {
  assert(pg17.includes(marker), `PG17 harness missing ${marker}`);
}

console.log('wos-v1-qa-storage-compat.test.ts: PASS');
