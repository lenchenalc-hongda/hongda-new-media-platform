import { readFileSync } from 'node:fs';

const file = process.argv[2];
const phase = process.argv[3] ?? 'installed-inactive';
if (!file) {
  console.error('usage: verify-runtime-security-signatures.mjs FILE [phase]');
  process.exit(2);
}

const rows = readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map(line => JSON.parse(line));
const functions = new Map(
  rows
    .filter(row => row.kind === 'function')
    .map(row => [row.name, row]),
);
const summary = rows.find(row =>
  row.kind === 'summary' && row.name === 'qa_gate_and_m2_absence');
if (!summary) throw new Error('RUNTIME_SECURITY_SUMMARY_MISSING');
if (summary.qa_operator_gate_present || summary.qa_office_gate_present) {
  throw new Error('QA_GATE_PRESENT_IN_PRODUCTION_RUNTIME');
}
if (summary.qa_named_object_count !== 0) {
  throw new Error('QA_NAMED_OBJECT_PRESENT_IN_PRODUCTION_RUNTIME');
}

const businessFunctions = [
  'wos_create_production_order(uuid,jsonb)',
  'wos_register_uploaded_reference_image(uuid,uuid,text,text)',
  'wos_confirm_office_completeness(uuid,integer,text,text)',
  'wos_submit_production_order(uuid,integer,text,uuid)',
  'wos_operator_order_action(uuid,integer,uuid,text,text)',
  'wos_office_save_correction(uuid,integer,uuid,jsonb,text)',
  'wos_office_resubmit_order(uuid,integer,uuid,text)',
  'wos_operator_review_correction(uuid,integer,uuid,text)',
];
const helperName = 'wos_v1_assert_current_image_set(uuid,uuid,text)';
const proof = rows.find(row =>
  row.kind === 'function'
  && row.name.startsWith('wos_p7_record_trusted_image_proof('));

function hasAcl(definition, grantee, privilege = 'EXECUTE') {
  return (definition?.acl ?? []).some(entry =>
    entry.grantee === grantee && entry.privilege === privilege);
}

const helper = functions.get(helperName);
if (!helper) throw new Error('IMAGE_SET_HELPER_MISSING');
for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
  if (hasAcl(helper, role)) {
    throw new Error(`IMAGE_SET_HELPER_EXPOSED_${role}`);
  }
}

if (!proof) throw new Error('TRUSTED_PROOF_FUNCTION_MISSING');
for (const role of ['PUBLIC', 'anon', 'authenticated']) {
  if (hasAcl(proof, role)) {
    throw new Error(`TRUSTED_PROOF_FUNCTION_EXPOSED_${role}`);
  }
}
if (!hasAcl(proof, 'service_role')) {
  throw new Error('TRUSTED_PROOF_SERVICE_ROLE_MISSING');
}

for (const name of businessFunctions) {
  const definition = functions.get(name);
  if (!definition) throw new Error(`BUSINESS_RPC_MISSING_${name}`);
  if (definition.security_definer !== true) {
    throw new Error(`BUSINESS_RPC_NOT_SECURITY_DEFINER_${name}`);
  }
  if (!(definition.config ?? []).includes('search_path=""')) {
    throw new Error(`BUSINESS_RPC_SEARCH_PATH_NOT_PINNED_${name}`);
  }
  const anon = hasAcl(definition, 'anon');
  const authenticated = hasAcl(definition, 'authenticated');
  const publicExecute = hasAcl(definition, 'PUBLIC');
  if (anon || publicExecute) {
    throw new Error(`BUSINESS_RPC_EXPOSED_BEFORE_ACTIVATION_${name}`);
  }
  if (phase === 'installed-inactive' && authenticated) {
    throw new Error(`BUSINESS_RPC_ACTIVE_BEFORE_AUTHORIZATION_${name}`);
  }
  if (phase === 'activated' && !authenticated) {
    throw new Error(`BUSINESS_RPC_NOT_ACTIVATED_${name}`);
  }
}

console.log(`WOS_V1_RUNTIME_SECURITY_SIGNATURES=${phase.toUpperCase()}_PASS`);
console.log('WOS_V1_INTERNAL_IMAGE_SET_HELPER_HIDDEN=PASS');
console.log('WOS_V1_SERVICE_PROOF_NOT_BROWSER_EXECUTABLE=PASS');
console.log('WOS_V1_QA_GATE_OBJECTS_ABSENT=PASS');
