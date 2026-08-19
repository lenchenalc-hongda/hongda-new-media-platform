// ===== Review Center Profile Directory Live Tests =====
// Uses real QA Admin / QA Viewer through normal authenticated clients.
// Service role is used only for read-only backing-row verification.
// Run: pnpm test:review-center:profile-directory:live

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { evaluateLiveAuthGate } from './live-auth-gate';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } });

const REQUIRED_ITEM_KEYS = ['assignment_eligible', 'department', 'display_name', 'profile_id', 'role'].sort().join(',');

function isOkEnvelope(result: any): boolean {
  return !result.error && !!result.data && result.data.ok === true && result.data.code === 'OK';
}

function directoryItems(result: any): any[] {
  if (!isOkEnvelope(result)) return [];
  const items = result.data?.data?.items;
  return Array.isArray(items) ? items : [];
}

async function readProfiles(client: any): Promise<any[]> {
  const { data, error } = await client
    .from('profiles')
    .select('id,org_id,is_active,full_name,email,role,department');
  return error ? [] : (data || []);
}

async function main() {
  console.log('\n=== Review Center Profile Directory Live ===');

  const gate = evaluateLiveAuthGate({
    authMode: process.env.AUTH_MODE,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    allowLiveAuthTests: process.env.ALLOW_LIVE_AUTH_TESTS,
    supabaseEnvironment: process.env.SUPABASE_ENVIRONMENT,
    adminEmail: process.env.LIVE_TEST_ADMIN_EMAIL,
    adminPassword: process.env.LIVE_TEST_ADMIN_PASSWORD,
    viewerEmail: process.env.LIVE_TEST_VIEWER_EMAIL,
    viewerPassword: process.env.LIVE_TEST_VIEWER_PASSWORD,
  });

  if (!gate.allowed) {
    skipped++;
    console.log('SKIPPED: ' + gate.reasons.join('; '));
    console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);
    return;
  }

  const adminClient = createClient(url, anonKey, clientOptions);
  const viewerClient = createClient(url, anonKey, clientOptions);
  const anonClient = createClient(url, anonKey, clientOptions);

  const adminLogin = await adminClient.auth.signInWithPassword({
    email: process.env.LIVE_TEST_ADMIN_EMAIL!,
    password: process.env.LIVE_TEST_ADMIN_PASSWORD!,
  });
  const viewerLogin = await viewerClient.auth.signInWithPassword({
    email: process.env.LIVE_TEST_VIEWER_EMAIL!,
    password: process.env.LIVE_TEST_VIEWER_PASSWORD!,
  });

  const adminLoginOk = !adminLogin.error && !!adminLogin.data?.user?.id;
  const viewerLoginOk = !viewerLogin.error && !!viewerLogin.data?.user?.id;
  assert(adminLoginOk, 'admin login');
  assert(viewerLoginOk, 'viewer login');

  const adminProfile = adminLoginOk
    ? await serviceClient.from('profiles').select('id,org_id,is_active,full_name,email,role,department').eq('user_id', adminLogin.data!.user.id).maybeSingle()
    : { data: null };
  const viewerProfile = viewerLoginOk
    ? await serviceClient.from('profiles').select('id,org_id,is_active,full_name,email,role,department').eq('user_id', viewerLogin.data!.user.id).maybeSingle()
    : { data: null };

  const admin = adminProfile.data;
  const viewer = viewerProfile.data;
  assert(!!admin && admin.is_active === true && admin.role === 'admin', 'admin backing profile');
  assert(!!viewer && viewer.is_active === true && viewer.role === 'viewer', 'viewer backing profile');
  assert(!!admin && !!viewer && admin.org_id === viewer.org_id, 'QA users same org');

  const actorOrgId = admin?.org_id || '';
  const viewerProfileId = viewer?.id || '';

  let adminMember = 'FAIL';
  let viewerMember = 'FAIL';
  let adminAssignment = 'FAIL';
  let viewerAssignment = 'FAIL';
  let adminViewerMemberEqual = 'NO';
  let viewerInMember = 'NO';
  let viewerAssignmentEligible = 'TRUE';
  let viewerAbsentAssignment = 'NO';
  let assignmentSubset = 'NO';
  let assignmentAllEligible = 'NO';
  let sameOrg = 'FAIL';
  let crossOrgFixture = 'NOT_AVAILABLE';
  let activeRows = 'FAIL';
  let inactiveFixture = 'NOT_AVAILABLE';
  let fieldSet = 'FAIL';
  let emailLeak = 'YES';
  let emailFallbackLeak = 'YES';
  let fullNameMapping = 'FAIL';
  let blankFixture = 'NOT_AVAILABLE';
  let departmentNull = 'FAIL';
  let memberOrderRepeat = 'FAIL';
  let adminViewerOrderEqual = 'NO';
  let memberOrderExpected = 'FAIL';
  let assignmentOrderRepeat = 'FAIL';
  let invalidNull = 'OTHER';
  let invalidEmpty = 'OTHER';
  let invalidUnknown = 'OTHER';
  let invalidLowerMember = 'OTHER';
  let invalidLowerAssignment = 'OTHER';
  let invalidWhitespace = 'OTHER';
  let invalidRawError = 'YES';
  let anonBlocked = 'ALLOWED';
  let inactiveActor = 'NOT_TESTED';
  let missingProfileActor = 'NOT_TESTED';

  try {
    if (!adminLoginOk || !viewerLoginOk || !admin || !viewer) throw new Error('QA setup failed');

    const adminMemberResult = await adminClient.rpc('review_profile_directory', { p_purpose: 'MEMBER' });
    const viewerMemberResult = await viewerClient.rpc('review_profile_directory', { p_purpose: 'MEMBER' });
    const adminAssignmentResult = await adminClient.rpc('review_profile_directory', { p_purpose: 'ASSIGNMENT' });
    const viewerAssignmentResult = await viewerClient.rpc('review_profile_directory', { p_purpose: 'ASSIGNMENT' });

    const adminMemberItems = directoryItems(adminMemberResult);
    const viewerMemberItems = directoryItems(viewerMemberResult);
    const adminAssignmentItems = directoryItems(adminAssignmentResult);
    const viewerAssignmentItems = directoryItems(viewerAssignmentResult);

    adminMember = isOkEnvelope(adminMemberResult) && Array.isArray(adminMemberItems) ? 'PASS' : 'FAIL';
    viewerMember = isOkEnvelope(viewerMemberResult) && Array.isArray(viewerMemberItems) ? 'PASS' : 'FAIL';
    adminAssignment = isOkEnvelope(adminAssignmentResult) && Array.isArray(adminAssignmentItems) ? 'PASS' : 'FAIL';
    viewerAssignment = isOkEnvelope(viewerAssignmentResult) && Array.isArray(viewerAssignmentItems) ? 'PASS' : 'FAIL';
    assert(adminMember === 'PASS', 'admin member directory');
    assert(viewerMember === 'PASS', 'viewer member directory');
    assert(adminAssignment === 'PASS', 'admin assignment directory');
    assert(viewerAssignment === 'PASS', 'viewer assignment directory');

    adminViewerMemberEqual = JSON.stringify(adminMemberItems) === JSON.stringify(viewerMemberItems) ? 'YES' : 'NO';
    assert(adminViewerMemberEqual === 'YES', 'admin/viewer member results equal');

    const viewerMemberItem = adminMemberItems.find((item: any) => item.profile_id === viewerProfileId);
    viewerInMember = viewerMemberItem ? 'YES' : 'NO';
    viewerAssignmentEligible = viewerMemberItem && viewerMemberItem.assignment_eligible === false ? 'FALSE' : 'TRUE';
    assert(viewerInMember === 'YES', 'viewer present in member');
    assert(viewerAssignmentEligible === 'FALSE', 'viewer assignment eligible false');

    const viewerInAssignment = adminAssignmentItems.some((item: any) => item.profile_id === viewerProfileId);
    viewerAbsentAssignment = viewerInAssignment ? 'NO' : 'YES';
    assert(viewerAbsentAssignment === 'YES', 'viewer absent from assignment');

    const memberIds = new Set(adminMemberItems.map((item: any) => item.profile_id));
    const assignmentIds = new Set(adminAssignmentItems.map((item: any) => item.profile_id));
    assignmentSubset = [...assignmentIds].every((id: string) => memberIds.has(id)) ? 'YES' : 'NO';
    assignmentAllEligible = adminAssignmentItems.every((item: any) => item.assignment_eligible === true && item.role !== 'viewer') ? 'YES' : 'NO';
    assert(assignmentSubset === 'YES', 'assignment subset of member');
    assert(assignmentAllEligible === 'YES', 'assignment all eligible');

    const allBackingProfiles = await readProfiles(serviceClient);
    const backingById = new Map(allBackingProfiles.map((p: any) => [p.id, p]));
    const otherOrgProfiles = allBackingProfiles.filter((p: any) => p.org_id !== actorOrgId);
    const inactiveOrgProfiles = allBackingProfiles.filter((p: any) => p.org_id === actorOrgId && p.is_active === false);
    const blankNameProfiles = allBackingProfiles.filter((p: any) => p.org_id === actorOrgId && p.is_active === true && (!p.full_name || p.full_name.trim() === ''));

    const allReturned = [...adminMemberItems, ...viewerMemberItems, ...adminAssignmentItems, ...viewerAssignmentItems];
    const allReturnedSameOrg = allReturned.every((item: any) => backingById.get(item.profile_id)?.org_id === actorOrgId);
    const allReturnedActive = allReturned.every((item: any) => backingById.get(item.profile_id)?.is_active === true);
    sameOrg = allReturnedSameOrg ? 'PASS' : 'FAIL';
    activeRows = allReturnedActive ? 'PASS' : 'FAIL';
    assert(sameOrg === 'PASS', 'returned rows all same org');
    assert(activeRows === 'PASS', 'returned rows all active');

    if (otherOrgProfiles.length > 0) {
      const crossOrgIds = new Set(otherOrgProfiles.map((p: any) => p.id));
      const leakedCrossOrg = allReturned.some((item: any) => crossOrgIds.has(item.profile_id));
      crossOrgFixture = leakedCrossOrg ? 'FAIL' : 'PASS';
      assert(crossOrgFixture === 'PASS', 'cross-org negative fixture');
    }

    if (inactiveOrgProfiles.length > 0) {
      const inactiveIds = new Set(inactiveOrgProfiles.map((p: any) => p.id));
      const leakedInactive = allReturned.some((item: any) => inactiveIds.has(item.profile_id));
      inactiveFixture = leakedInactive ? 'FAIL' : 'PASS';
      assert(inactiveFixture === 'PASS', 'inactive negative fixture');
    }

    fieldSet = adminMemberItems.every((item: any) => Object.keys(item).sort().join(',') === REQUIRED_ITEM_KEYS) ? 'PASS' : 'FAIL';
    assert(fieldSet === 'PASS', 'strict return field set');

    const serialized = JSON.stringify(adminMemberItems);
    emailLeak = /"email"/.test(serialized) ? 'YES' : 'NO';
    assert(emailLeak === 'NO', 'email field not leaked');

    const emailFallbackLeakFound = adminMemberItems.some((item: any) => {
      const backing = backingById.get(item.profile_id);
      return !!backing && typeof backing.email === 'string' && item.display_name === backing.email;
    });
    emailFallbackLeak = emailFallbackLeakFound ? 'YES' : 'NO';
    assert(emailFallbackLeak === 'NO', 'email display fallback not leaked');

    const fullNameMismatch = adminMemberItems.some((item: any) => {
      const backing = backingById.get(item.profile_id);
      if (!backing) return true;
      if (backing.full_name && backing.full_name.trim() !== '') {
        return item.display_name !== backing.full_name.trim();
      }
      return item.display_name !== '未命名用户';
    });
    fullNameMapping = fullNameMismatch ? 'FAIL' : 'PASS';
    assert(fullNameMapping === 'PASS', 'full_name display mapping');

    if (blankNameProfiles.length > 0) {
      blankFixture = adminMemberItems
        .filter((item: any) => blankNameProfiles.some((p: any) => p.id === item.profile_id))
        .every((item: any) => item.display_name === '未命名用户') ? 'PASS' : 'FAIL';
      assert(blankFixture === 'PASS', 'blank name fallback');
    }

    const departmentMismatch = adminMemberItems.some((item: any) => {
      const backing = backingById.get(item.profile_id);
      return !backing || item.department !== backing.department;
    });
    departmentNull = departmentMismatch ? 'FAIL' : 'PASS';
    assert(departmentNull === 'PASS', 'department null handling');

    const adminMember1 = await adminClient.rpc('review_profile_directory', { p_purpose: 'MEMBER' });
    const adminMember2 = await adminClient.rpc('review_profile_directory', { p_purpose: 'MEMBER' });
    const adminMember3 = await adminClient.rpc('review_profile_directory', { p_purpose: 'MEMBER' });
    const memberIdRuns = [
      directoryItems(adminMember1).map((item: any) => item.profile_id),
      directoryItems(adminMember2).map((item: any) => item.profile_id),
      directoryItems(adminMember3).map((item: any) => item.profile_id),
    ];
    memberOrderRepeat = memberIdRuns.every((ids: string[]) => JSON.stringify(ids) === JSON.stringify(memberIdRuns[0])) ? 'PASS' : 'FAIL';
    assert(memberOrderRepeat === 'PASS', 'member order repeatable');

    adminViewerOrderEqual = JSON.stringify(memberIdRuns[0]) === JSON.stringify(viewerMemberItems.map((item: any) => item.profile_id)) ? 'YES' : 'NO';
    assert(adminViewerOrderEqual === 'YES', 'admin/viewer member order equal');

    const expectedMemberIds = [...adminMemberItems].sort((a: any, b: any) => {
      const da = a.department == null ? 1 : 0;
      const db = b.department == null ? 1 : 0;
      if (da !== db) return da - db;
      const na = a.department ?? '';
      const nb = b.department ?? '';
      if (na !== nb) return na < nb ? -1 : 1;
      if (a.display_name !== b.display_name) return a.display_name < b.display_name ? -1 : 1;
      return a.profile_id.localeCompare(b.profile_id);
    }).map((item: any) => item.profile_id);
    memberOrderExpected = JSON.stringify(memberIdRuns[0]) === JSON.stringify(expectedMemberIds) ? 'PASS' : 'FAIL';
    assert(memberOrderExpected === 'PASS', 'member order matches expected');

    const adminAssignment1 = await adminClient.rpc('review_profile_directory', { p_purpose: 'ASSIGNMENT' });
    const adminAssignment2 = await adminClient.rpc('review_profile_directory', { p_purpose: 'ASSIGNMENT' });
    const assignmentIds1 = directoryItems(adminAssignment1).map((item: any) => item.profile_id);
    const assignmentIds2 = directoryItems(adminAssignment2).map((item: any) => item.profile_id);
    assignmentOrderRepeat = JSON.stringify(assignmentIds1) === JSON.stringify(assignmentIds2) ? 'PASS' : 'FAIL';
    assert(assignmentOrderRepeat === 'PASS', 'assignment order repeatable');

    const invalidValues = [
      null,
      '',
      'UNKNOWN',
      'member',
      'assignment',
      ' MEMBER ',
    ];
    const invalidResults = [];
    for (const value of invalidValues) {
      const result = await adminClient.rpc('review_profile_directory', { p_purpose: value });
      invalidResults.push(result);
    }

    invalidNull = rpcInvalidPurpose(invalidResults[0]) ? 'INVALID_PURPOSE' : 'OTHER';
    invalidEmpty = rpcInvalidPurpose(invalidResults[1]) ? 'INVALID_PURPOSE' : 'OTHER';
    invalidUnknown = rpcInvalidPurpose(invalidResults[2]) ? 'INVALID_PURPOSE' : 'OTHER';
    invalidLowerMember = rpcInvalidPurpose(invalidResults[3]) ? 'INVALID_PURPOSE' : 'OTHER';
    invalidLowerAssignment = rpcInvalidPurpose(invalidResults[4]) ? 'INVALID_PURPOSE' : 'OTHER';
    invalidWhitespace = rpcInvalidPurpose(invalidResults[5]) ? 'INVALID_PURPOSE' : 'OTHER';
    invalidRawError = invalidResults.some((result: any) => !!result.error && !result.data) ? 'YES' : 'NO';
    assert(invalidNull === 'INVALID_PURPOSE', 'invalid purpose null');
    assert(invalidEmpty === 'INVALID_PURPOSE', 'invalid purpose empty');
    assert(invalidUnknown === 'INVALID_PURPOSE', 'invalid purpose unknown');
    assert(invalidLowerMember === 'INVALID_PURPOSE', 'invalid purpose lower member');
    assert(invalidLowerAssignment === 'INVALID_PURPOSE', 'invalid purpose lower assignment');
    assert(invalidWhitespace === 'INVALID_PURPOSE', 'invalid purpose whitespace');
    assert(invalidRawError === 'NO', 'invalid purpose no raw db error');

    const anonResult = await anonClient.rpc('review_profile_directory', { p_purpose: 'MEMBER' });
    anonBlocked = !!anonResult.error && !anonResult.data ? 'BLOCKED' : 'ALLOWED';
    assert(anonBlocked === 'BLOCKED', 'anon directory access blocked');
  } catch (err: any) {
    console.error('LIVE CRASH: ' + String(err?.message || err));
  } finally {
    await serviceClient.auth.signOut();
  }

  console.log('LIVE_GATE=' + (gate.allowed ? 'PASS' : 'FAIL'));
  console.log('ADMIN_LOGIN=' + (adminLoginOk ? 'PASS' : 'FAIL'));
  console.log('VIEWER_LOGIN=' + (viewerLoginOk ? 'PASS' : 'FAIL'));
  console.log('ADMIN_MEMBER_DIRECTORY=' + adminMember);
  console.log('VIEWER_MEMBER_DIRECTORY=' + viewerMember);
  console.log('ADMIN_ASSIGNMENT_DIRECTORY=' + adminAssignment);
  console.log('VIEWER_ASSIGNMENT_DIRECTORY=' + viewerAssignment);
  console.log('ADMIN_VIEWER_MEMBER_RESULTS_EQUAL=' + adminViewerMemberEqual);
  console.log('QA_VIEWER_PRESENT_IN_MEMBER=' + viewerInMember);
  console.log('QA_VIEWER_ASSIGNMENT_ELIGIBLE=' + viewerAssignmentEligible);
  console.log('QA_VIEWER_ABSENT_FROM_ASSIGNMENT=' + viewerAbsentAssignment);
  console.log('ASSIGNMENT_SET_SUBSET_OF_MEMBER=' + assignmentSubset);
  console.log('ASSIGNMENT_ALL_ELIGIBLE=' + assignmentAllEligible);
  console.log('RETURNED_ROWS_ALL_SAME_ORG=' + sameOrg);
  console.log('CROSS_ORG_NEGATIVE_FIXTURE=' + crossOrgFixture);
  console.log('RETURNED_ROWS_ALL_ACTIVE=' + activeRows);
  console.log('INACTIVE_NEGATIVE_FIXTURE=' + inactiveFixture);
  console.log('RETURN_FIELD_SET_STRICT=' + fieldSet);
  console.log('EMAIL_FIELD_LEAK=' + emailLeak);
  console.log('EMAIL_DISPLAY_FALLBACK_LEAK=' + emailFallbackLeak);
  console.log('FULL_NAME_DISPLAY_MAPPING=' + fullNameMapping);
  console.log('BLANK_NAME_FIXTURE=' + blankFixture);
  console.log('DEPARTMENT_NULL_HANDLING=' + departmentNull);
  console.log('MEMBER_ORDER_REPEATABLE=' + memberOrderRepeat);
  console.log('MEMBER_ADMIN_VIEWER_ORDER_EQUAL=' + adminViewerOrderEqual);
  console.log('MEMBER_ORDER_MATCHES_EXPECTED=' + memberOrderExpected);
  console.log('ASSIGNMENT_ORDER_REPEATABLE=' + assignmentOrderRepeat);
  console.log('INVALID_PURPOSE_NULL=' + invalidNull);
  console.log('INVALID_PURPOSE_EMPTY=' + invalidEmpty);
  console.log('INVALID_PURPOSE_UNKNOWN=' + invalidUnknown);
  console.log('INVALID_PURPOSE_LOWER_MEMBER=' + invalidLowerMember);
  console.log('INVALID_PURPOSE_LOWER_ASSIGNMENT=' + invalidLowerAssignment);
  console.log('INVALID_PURPOSE_WHITESPACE=' + invalidWhitespace);
  console.log('INVALID_PURPOSE_RAW_DB_ERROR=' + invalidRawError);
  console.log('ANON_DIRECTORY_ACCESS=' + anonBlocked);
  console.log('INACTIVE_ACTOR_CASE=' + inactiveActor);
  console.log('MISSING_PROFILE_ACTOR_CASE=' + missingProfileActor);
  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);

  if (failed > 0) process.exitCode = 1;
}

function rpcInvalidPurpose(result: any): boolean {
  return !result.error && !!result.data && result.data.ok === false && result.data.code === 'INVALID_PURPOSE';
}

main().catch(err => {
  console.error('Live test crashed: ' + String(err?.message || err));
  process.exit(1);
});
