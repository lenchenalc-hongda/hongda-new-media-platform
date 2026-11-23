import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical(value[key])]),
    );
  }
  return value;
}

function parseRows(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .sort((left, right) =>
      left.kind.localeCompare(right.kind)
      || left.name.localeCompare(right.name));
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function build(inputPath, outputPath, phase) {
  if (!['installed-inactive', 'activated'].includes(phase)) {
    throw new Error('INVALID_RUNTIME_SECURITY_PHASE');
  }
  const rows = parseRows(inputPath);
  const manifest = {
    schema_version: 1,
    phase,
    row_count: rows.length,
    aggregate_sha256: digest(rows),
    rows,
  };
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`WOS_V1_RUNTIME_SECURITY_MANIFEST_WRITTEN=${outputPath}`);
}

function hasAcl(definition, grantee, privilege = 'EXECUTE') {
  return (definition?.acl ?? []).some(entry =>
    entry.grantee === grantee && entry.privilege === privilege);
}

function assertNoApplicationGrantOptions(rows) {
  const applicationRoles = new Set([
    'PUBLIC',
    'anon',
    'authenticated',
    'service_role',
  ]);
  for (const row of rows) {
    for (const entry of row.acl ?? []) {
      if (applicationRoles.has(entry.grantee) && entry.is_grantable === true) {
        throw new Error(
          `APPLICATION_ROLE_GRANT_OPTION_EXPOSED_${row.kind}_${row.name}_${entry.grantee}`,
        );
      }
    }
  }
}

function verify(inputPath, manifestPath, phase) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const rows = parseRows(inputPath);
  if (manifest.schema_version !== 1
    || manifest.phase !== phase
    || manifest.row_count !== manifest.rows.length
    || manifest.row_count !== rows.length
    || manifest.aggregate_sha256 !== digest(manifest.rows)
    || digest(rows) !== manifest.aggregate_sha256
    || JSON.stringify(rows) !== JSON.stringify(manifest.rows)) {
    throw new Error(`RUNTIME_SECURITY_MANIFEST_MISMATCH_${phase}`);
  }

  const functions = new Map(
    rows
      .filter(row => row.kind === 'function')
      .map(row => [row.name, row]),
  );
  const tables = new Map(
    rows
      .filter(row => row.kind === 'table')
      .map(row => [row.name, row]),
  );
  const summary = rows.find(row =>
    row.kind === 'summary' && row.name === 'qa_gate_and_m2_absence');
  const bucketSummary = rows.find(row =>
    row.kind === 'summary' && row.name === 'private_bucket_contract');
  if (!summary) throw new Error('RUNTIME_SECURITY_SUMMARY_MISSING');
  if (!bucketSummary
    || bucketSummary.bucket_count !== 1
    || bucketSummary.storage_policy_count !== 2) {
    throw new Error('PRIVATE_BUCKET_SECURITY_SUMMARY_INVALID');
  }
  if (summary.qa_operator_gate_present
    || summary.qa_office_gate_present
    || summary.qa_named_object_count !== 0) {
    throw new Error('QA_ONLY_OBJECT_PRESENT_IN_PRODUCTION_RUNTIME');
  }
  assertNoApplicationGrantOptions(rows);

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
  const helper = functions.get('wos_v1_assert_current_image_set(uuid,uuid,text)');
  if (!helper) throw new Error('IMAGE_SET_HELPER_MISSING');
  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    if (hasAcl(helper, role)) {
      throw new Error(`IMAGE_SET_HELPER_EXPOSED_${role}`);
    }
  }

  const proof = [...functions.values()].find(definition =>
    definition.name.startsWith('wos_p7_record_trusted_image_proof('));
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
    if (definition.security_definer !== true
      || !(definition.config ?? []).includes('search_path=""')) {
      throw new Error(`BUSINESS_RPC_SECURITY_ATTRIBUTES_INVALID_${name}`);
    }
    const anon = hasAcl(definition, 'anon');
    const authenticated = hasAcl(definition, 'authenticated');
    const publicExecute = hasAcl(definition, 'PUBLIC');
    if (anon || publicExecute) {
      throw new Error(`BUSINESS_RPC_EXPOSED_TO_UNAUTHORIZED_ROLE_${name}`);
    }
    if (phase === 'installed-inactive' && authenticated) {
      throw new Error(`BUSINESS_RPC_ACTIVE_BEFORE_AUTHORIZATION_${name}`);
    }
    if (phase === 'activated' && !authenticated) {
      throw new Error(`BUSINESS_RPC_NOT_ACTIVATED_${name}`);
    }
  }

  for (const [name, table] of tables) {
    if (hasAcl(table, 'anon', 'INSERT')
      || hasAcl(table, 'anon', 'UPDATE')
      || hasAcl(table, 'anon', 'DELETE')
      || hasAcl(table, 'authenticated', 'INSERT')
      || hasAcl(table, 'authenticated', 'UPDATE')
      || hasAcl(table, 'authenticated', 'DELETE')) {
      throw new Error(`DIRECT_BROWSER_DML_EXPOSED_${name}`);
    }
  }

  console.log(`WOS_V1_RUNTIME_SECURITY_SIGNATURES=${phase.toUpperCase()}_PASS`);
  console.log('WOS_V1_RUNTIME_DEFINITION_ACL_TABLE_POLICY_MANIFEST=PASS');
  console.log('WOS_V1_INTERNAL_IMAGE_SET_HELPER_HIDDEN=PASS');
  console.log('WOS_V1_SERVICE_PROOF_NOT_BROWSER_EXECUTABLE=PASS');
  console.log('WOS_V1_PRIVATE_BUCKET_AND_STORAGE_POLICIES=PASS');
  console.log('WOS_V1_QA_GATE_OBJECTS_ABSENT=PASS');
  console.log('WOS_V1_APPLICATION_ROLE_GRANT_OPTIONS=ABSENT');
}

const [mode, inputPath, outputPath, phase] = process.argv.slice(2);
if (mode === 'build' && inputPath && outputPath && phase) {
  build(inputPath, outputPath, phase);
} else if (mode === 'verify' && inputPath && outputPath && phase) {
  verify(inputPath, outputPath, phase);
} else {
  throw new Error(
    'usage: verify-runtime-security-signatures.mjs '
    + 'build <input> <manifest> <phase> | '
    + 'verify <input> <manifest> <phase>',
  );
}
