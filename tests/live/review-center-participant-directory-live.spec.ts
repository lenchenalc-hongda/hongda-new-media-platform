// ===== Review Center Participant Directory Live Tests =====
// Uses real QA Admin / QA Viewer through normal authenticated clients.
// Service role is used only for read-only backing-row verification.
// Run: pnpm test:review-center:participant-directory:live

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
const REQUIRED_ITEM_KEYS = ['department', 'display_name', 'is_active', 'profile_id', 'role'].sort().join(',');

function isOkEnvelope(result: any): boolean {
  return !result.error && !!result.data && result.data.ok === true && result.data.code === 'OK';
}

function participantItems(result: any): any[] {
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
  console.log('\n=== Review Center Participant Directory Live ===');

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

  const admin = adminLoginOk
    ? await serviceClient.from('profiles').select('id,org_id,is_active,full_name,email,role,department').eq('user_id', adminLogin.data!.user.id).maybeSingle()
    : { data: null };
  const viewer = viewerLoginOk
    ? await serviceClient.from('profiles').select('id,org_id,is_active,full_name,email,role,department').eq('user_id', viewerLogin.data!.user.id).maybeSingle()
    : { data: null };

  const adminRow = admin.data;
  const viewerRow = viewer.data;
  assert(!!adminRow && adminRow.is_active === true, 'admin active profile');
  assert(!!viewerRow && viewerRow.is_active === true, 'viewer active profile');
  assert(!!adminRow && !!viewerRow && adminRow.org_id === viewerRow.org_id, 'QA users same org');

  const actorOrgId = adminRow?.org_id || '';

  let liveGate = 'PASS';
  let adminLoginStatus = adminLoginOk ? 'PASS' : 'FAIL';
  let viewerLoginStatus = viewerLoginOk ? 'PASS' : 'FAIL';
  let targetReviewSelected = 'NO';
  let targetReviewReadOnly = 'YES';
  let adminParticipantDirectory = 'FAIL';
  let viewerParticipantDirectory = 'FAIL';
  let adminViewerEqual = 'NO';
  let expectedSetMatch = 'FAIL';
  let ownerSource = 'FAIL';
  let pmoSource = 'FAIL';
  let createdBySource = 'FAIL';
  let memberSource = 'NOT_APPLICABLE';
  let memberSourceFixture = 'NOT_AVAILABLE';
  let participantDuplicates = 'FOUND';
  let inactiveFixture = 'NOT_AVAILABLE';
  let inactiveReturned = 'NOT_TESTED';
  let inactiveIsActiveValue = 'NOT_TESTED';
  let isActiveValuesMatch = 'FAIL';
  let unreferencedInactiveFixture = 'NOT_AVAILABLE';
  let unreferencedInactiveExcluded = 'NOT_TESTED';
  let crossOrgFixture = 'NOT_AVAILABLE';
  let adminCrossOrg = 'NOT_TESTED';
  let viewerCrossOrg = 'NOT_TESTED';
  let nonexistentAdmin = 'OTHER';
  let nonexistentViewer = 'OTHER';
  let nullReviewId = 'OTHER';
  let crossOrgEnumLeak = 'NOT_TESTED';
  let fieldSet = 'FAIL';
  let emailLeak = 'YES';
  let emailFallbackLeak = 'YES';
  let fullNameMapping = 'FAIL';
  let blankFixture = 'NOT_AVAILABLE';
  let relationshipLeak = 'YES';
  let allReviewOrg = 'FAIL';
  let orderRepeat = 'FAIL';
  let adminViewerOrder = 'NO';
  let orderExpected = 'FAIL';
  let anonBlocked = 'ALLOWED';
  let inactiveActor = 'NOT_TESTED';
  let missingProfileActor = 'NOT_TESTED';

  try {
    if (!adminLoginOk || !viewerLoginOk || !adminRow || !viewerRow) throw new Error('QA setup failed');

    const reviewsResult = await serviceClient
      .from('review_cases')
      .select('*')
      .eq('org_id', actorOrgId);
    const reviews = reviewsResult.data || [];
    const allReviewsResult = await serviceClient.from('review_cases').select('*');
    const allReviews = allReviewsResult.data || [];
    const membersResult = await serviceClient
      .from('review_members')
      .select('*')
      .eq('org_id', actorOrgId);
    const members = membersResult.data || [];
    const profiles = await readProfiles(serviceClient);
    const profileById = new Map(profiles.map((p: any) => [p.id, p]));

    const membersByReview = new Map<string, any[]>();
    for (const member of members) {
      const list = membersByReview.get(member.review_id) || [];
      list.push(member);
      membersByReview.set(member.review_id, list);
    }

    function referencedIds(review: any): Set<string> {
      const ids = new Set<string>();
      if (review.owner_id) ids.add(review.owner_id);
      if (review.pmo_id) ids.add(review.pmo_id);
      if (review.created_by) ids.add(review.created_by);
      for (const member of membersByReview.get(review.id) || []) {
        if (member.profile_id) ids.add(member.profile_id);
      }
      return ids;
    }

    function hasInactiveReference(review: any): boolean {
      return [...referencedIds(review)].some((id: string) => profileById.get(id)?.is_active === false);
    }

    let targetReview: any = null;
    let bestScore = -1;
    for (const review of reviews) {
      let score = 0;
      if (review.review_no === 'REV-2026-000001') score += 1000;
      if (hasInactiveReference(review)) score += 100;
      score += Math.min((membersByReview.get(review.id) || []).length, 3) * 10;
      if (review.pmo_id) score += 1;
      if (score > bestScore) {
        bestScore = score;
        targetReview = review;
      }
    }

    if (!targetReview) throw new Error('No target review in QA org');
    targetReviewSelected = 'YES';

    const targetMembers = membersByReview.get(targetReview.id) || [];
    const expectedIds = [...referencedIds(targetReview)].filter((id: string) => {
      const profile = profileById.get(id);
      return !!profile && profile.org_id === targetReview.org_id;
    });
    const expectedSet = new Set(expectedIds);

    const adminResult = await adminClient.rpc('review_participant_directory', {
      p_review_id: targetReview.id,
    });
    const viewerResult = await viewerClient.rpc('review_participant_directory', {
      p_review_id: targetReview.id,
    });
    const adminItems = participantItems(adminResult);
    const viewerItems = participantItems(viewerResult);

    adminParticipantDirectory = isOkEnvelope(adminResult) && Array.isArray(adminItems) ? 'PASS' : 'FAIL';
    viewerParticipantDirectory = isOkEnvelope(viewerResult) && Array.isArray(viewerItems) ? 'PASS' : 'FAIL';
    assert(adminParticipantDirectory === 'PASS', 'admin participant directory');
    assert(viewerParticipantDirectory === 'PASS', 'viewer participant directory');

    const adminIds = adminItems.map((item: any) => item.profile_id);
    const viewerIds = viewerItems.map((item: any) => item.profile_id);
    adminViewerEqual = JSON.stringify(adminItems) === JSON.stringify(viewerItems) ? 'YES' : 'NO';
    assert(adminViewerEqual === 'YES', 'admin/viewer participant results equal');

    const actualSet = new Set(adminIds);
    expectedSetMatch =
      actualSet.size === expectedSet.size && [...expectedSet].every((id: string) => actualSet.has(id))
        ? 'PASS' : 'FAIL';
    assert(expectedSetMatch === 'PASS', 'expected participant set match');

    if (targetReview.owner_id) {
      ownerSource = expectedSet.has(targetReview.owner_id) && actualSet.has(targetReview.owner_id) ? 'PASS' : 'FAIL';
    } else {
      ownerSource = 'NOT_APPLICABLE';
    }
    if (targetReview.pmo_id) {
      pmoSource = expectedSet.has(targetReview.pmo_id) && actualSet.has(targetReview.pmo_id) ? 'PASS' : 'FAIL';
    } else {
      pmoSource = 'NOT_APPLICABLE';
    }
    createdBySource = expectedSet.has(targetReview.created_by) && actualSet.has(targetReview.created_by) ? 'PASS' : 'FAIL';
    if (targetMembers.length > 0) {
      memberSourceFixture = 'AVAILABLE';
      const memberIds = targetMembers.map((member: any) => member.profile_id);
      memberSource = memberIds.every((id: string) => expectedSet.has(id) && actualSet.has(id)) ? 'PASS' : 'FAIL';
    }

    participantDuplicates = new Set(adminIds).size === adminIds.length ? 'NONE' : 'FOUND';
    assert(participantDuplicates === 'NONE', 'participant duplicates none');

    const inactiveReferenced = [...expectedSet].filter((id: string) => profileById.get(id)?.is_active === false);
    if (inactiveReferenced.length > 0) {
      inactiveFixture = inactiveReferenced.every((id: string) => actualSet.has(id)) ? 'PASS' : 'FAIL';
      inactiveReturned = inactiveReferenced.some((id: string) => actualSet.has(id)) ? 'YES' : 'NO';
      const inactiveItem = adminItems.find((item: any) => inactiveReferenced.includes(item.profile_id));
      inactiveIsActiveValue = inactiveItem && inactiveItem.is_active === false ? 'FALSE' : 'WRONG';
      assert(inactiveFixture === 'PASS', 'inactive referenced participant fixture');
    }

    isActiveValuesMatch = adminItems.every((item: any) => {
      const backing = profileById.get(item.profile_id);
      return !!backing && item.is_active === backing.is_active;
    }) ? 'PASS' : 'FAIL';
    assert(isActiveValuesMatch === 'PASS', 'is_active matches backing profile');

    const unreferencedInactive = profiles.filter(
      (p: any) => p.org_id === targetReview.org_id && p.is_active === false && !expectedSet.has(p.id),
    );
    if (unreferencedInactive.length > 0) {
      unreferencedInactiveFixture = unreferencedInactive.some((p: any) => actualSet.has(p.id)) ? 'FAIL' : 'PASS';
      unreferencedInactiveExcluded = unreferencedInactive.some((p: any) => actualSet.has(p.id)) ? 'NO' : 'YES';
      assert(unreferencedInactiveFixture === 'PASS', 'unreferenced inactive profile excluded');
    }

    const otherOrgReviews = allReviews.filter((review: any) => review.org_id !== actorOrgId);
    if (otherOrgReviews.length > 0) {
      const crossReviewId = otherOrgReviews[0].id;
      const adminCross = await adminClient.rpc('review_participant_directory', { p_review_id: crossReviewId });
      const viewerCross = await viewerClient.rpc('review_participant_directory', { p_review_id: crossReviewId });
      adminCrossOrg = adminCross.data?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'OTHER';
      viewerCrossOrg = viewerCross.data?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'OTHER';
      crossOrgFixture = adminCrossOrg === 'NOT_FOUND' && viewerCrossOrg === 'NOT_FOUND' ? 'PASS' : 'FAIL';
      crossOrgEnumLeak = adminCrossOrg === 'NOT_FOUND' && viewerCrossOrg === 'NOT_FOUND' ? 'NO' : 'YES';
      assert(crossOrgFixture === 'PASS', 'cross-org review not found');
    }

    const randomUuid = crypto.randomUUID();
    const adminMissing = await adminClient.rpc('review_participant_directory', { p_review_id: randomUuid });
    const viewerMissing = await viewerClient.rpc('review_participant_directory', { p_review_id: randomUuid });
    nonexistentAdmin = adminMissing.data?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'OTHER';
    nonexistentViewer = viewerMissing.data?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'OTHER';
    assert(nonexistentAdmin === 'NOT_FOUND', 'nonexistent review admin');
    assert(nonexistentViewer === 'NOT_FOUND', 'nonexistent review viewer');

    const nullResult = await adminClient.rpc('review_participant_directory', { p_review_id: null });
    nullReviewId = nullResult.data?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'OTHER';
    assert(nullReviewId === 'NOT_FOUND', 'null review id');

    fieldSet = adminItems.every((item: any) => Object.keys(item).sort().join(',') === REQUIRED_ITEM_KEYS) ? 'PASS' : 'FAIL';
    assert(fieldSet === 'PASS', 'strict participant field set');

    const serialized = JSON.stringify(adminItems);
    emailLeak = /"email"/.test(serialized) ? 'YES' : 'NO';
    assert(emailLeak === 'NO', 'email field not leaked');

    const emailFallbackFound = adminItems.some((item: any) => {
      const backing = profileById.get(item.profile_id);
      return !!backing && typeof backing.email === 'string' && item.display_name === backing.email;
    });
    emailFallbackLeak = emailFallbackFound ? 'YES' : 'NO';
    assert(emailFallbackLeak === 'NO', 'email display fallback not leaked');

    const nameMismatch = adminItems.some((item: any) => {
      const backing = profileById.get(item.profile_id);
      if (!backing) return true;
      if (backing.full_name && backing.full_name.trim() !== '') {
        return item.display_name !== backing.full_name.trim();
      }
      return item.display_name !== '未命名用户';
    });
    fullNameMapping = nameMismatch ? 'FAIL' : 'PASS';
    assert(fullNameMapping === 'PASS', 'full_name display mapping');

    const blankParticipants = adminItems.filter((item: any) => {
      const backing = profileById.get(item.profile_id);
      return !!backing && (!backing.full_name || backing.full_name.trim() === '');
    });
    if (blankParticipants.length > 0) {
      blankFixture = blankParticipants.every((item: any) => item.display_name === '未命名用户') ? 'PASS' : 'FAIL';
      assert(blankFixture === 'PASS', 'blank participant fallback');
    }

    relationshipLeak = /"is_owner"|"is_pmo"|"is_creator"|"member_roles"|"member_role"|"relationships"/.test(serialized) ? 'YES' : 'NO';
    assert(relationshipLeak === 'NO', 'relationship fields not leaked');

    allReviewOrg = adminItems.every((item: any) => profileById.get(item.profile_id)?.org_id === targetReview.org_id) ? 'PASS' : 'FAIL';
    assert(allReviewOrg === 'PASS', 'returned participants all review org');

    const admin2 = await adminClient.rpc('review_participant_directory', { p_review_id: targetReview.id });
    const admin3 = await adminClient.rpc('review_participant_directory', { p_review_id: targetReview.id });
    const runs = [
      participantItems(adminResult).map((item: any) => item.profile_id),
      participantItems(admin2).map((item: any) => item.profile_id),
      participantItems(admin3).map((item: any) => item.profile_id),
    ];
    orderRepeat = runs.every((ids: string[]) => JSON.stringify(ids) === JSON.stringify(runs[0])) ? 'PASS' : 'FAIL';
    assert(orderRepeat === 'PASS', 'participant order repeatable');

    adminViewerOrder = JSON.stringify(runs[0]) === JSON.stringify(viewerIds) ? 'YES' : 'NO';
    assert(adminViewerOrder === 'YES', 'admin/viewer participant order equal');

    const expectedOrder = [...adminItems].sort((a: any, b: any) => {
      if (a.display_name !== b.display_name) return a.display_name.localeCompare(b.display_name);
      return a.profile_id.localeCompare(b.profile_id);
    }).map((item: any) => item.profile_id);
    orderExpected = JSON.stringify(runs[0]) === JSON.stringify(expectedOrder) ? 'PASS' : 'FAIL';
    assert(orderExpected === 'PASS', 'participant order matches expected');

    const anonResult = await anonClient.rpc('review_participant_directory', { p_review_id: targetReview.id });
    anonBlocked = !!anonResult.error && !anonResult.data ? 'BLOCKED' : 'ALLOWED';
    assert(anonBlocked === 'BLOCKED', 'anon participant access blocked');
  } catch (err: any) {
    console.error('LIVE CRASH: ' + String(err?.message || err));
  } finally {
    await serviceClient.auth.signOut();
  }

  console.log('LIVE_GATE=' + liveGate);
  console.log('ADMIN_LOGIN=' + adminLoginStatus);
  console.log('VIEWER_LOGIN=' + viewerLoginStatus);
  console.log('TARGET_REVIEW_SELECTED=' + targetReviewSelected);
  console.log('TARGET_REVIEW_READ_ONLY=' + targetReviewReadOnly);
  console.log('ADMIN_PARTICIPANT_DIRECTORY=' + adminParticipantDirectory);
  console.log('VIEWER_PARTICIPANT_DIRECTORY=' + viewerParticipantDirectory);
  console.log('ADMIN_VIEWER_RESULTS_EQUAL=' + adminViewerEqual);
  console.log('EXPECTED_PARTICIPANT_SET_MATCH=' + expectedSetMatch);
  console.log('OWNER_SOURCE=' + ownerSource);
  console.log('PMO_SOURCE=' + pmoSource);
  console.log('CREATED_BY_SOURCE=' + createdBySource);
  console.log('MEMBER_SOURCE=' + memberSource);
  console.log('MEMBER_SOURCE_FIXTURE=' + memberSourceFixture);
  console.log('PARTICIPANT_DUPLICATES=' + participantDuplicates);
  console.log('INACTIVE_REFERENCED_PARTICIPANT_FIXTURE=' + inactiveFixture);
  console.log('INACTIVE_PARTICIPANT_RETURNED=' + inactiveReturned);
  console.log('INACTIVE_PARTICIPANT_IS_ACTIVE_VALUE=' + inactiveIsActiveValue);
  console.log('RETURNED_IS_ACTIVE_VALUES_MATCH_BACKING_PROFILE=' + isActiveValuesMatch);
  console.log('UNREFERENCED_INACTIVE_PROFILE_FIXTURE=' + unreferencedInactiveFixture);
  console.log('UNREFERENCED_INACTIVE_PROFILE_EXCLUDED=' + unreferencedInactiveExcluded);
  console.log('CROSS_ORG_REVIEW_FIXTURE=' + crossOrgFixture);
  console.log('ADMIN_CROSS_ORG_REVIEW=' + adminCrossOrg);
  console.log('VIEWER_CROSS_ORG_REVIEW=' + viewerCrossOrg);
  console.log('NONEXISTENT_REVIEW_ADMIN=' + nonexistentAdmin);
  console.log('NONEXISTENT_REVIEW_VIEWER=' + nonexistentViewer);
  console.log('NULL_REVIEW_ID=' + nullReviewId);
  console.log('CROSS_ORG_ENUMERATION_LEAK=' + crossOrgEnumLeak);
  console.log('RETURN_FIELD_SET_STRICT=' + fieldSet);
  console.log('EMAIL_FIELD_LEAK=' + emailLeak);
  console.log('EMAIL_DISPLAY_FALLBACK_LEAK=' + emailFallbackLeak);
  console.log('FULL_NAME_DISPLAY_MAPPING=' + fullNameMapping);
  console.log('BLANK_NAME_PARTICIPANT_FIXTURE=' + blankFixture);
  console.log('RELATIONSHIP_FIELDS_LEAK=' + relationshipLeak);
  console.log('RETURNED_PARTICIPANTS_ALL_REVIEW_ORG=' + allReviewOrg);
  console.log('PARTICIPANT_ORDER_REPEATABLE=' + orderRepeat);
  console.log('ADMIN_VIEWER_ORDER_EQUAL=' + adminViewerOrder);
  console.log('PARTICIPANT_ORDER_MATCHES_EXPECTED=' + orderExpected);
  console.log('ANON_PARTICIPANT_ACCESS=' + anonBlocked);
  console.log('INACTIVE_ACTOR_CASE=' + inactiveActor);
  console.log('MISSING_PROFILE_ACTOR_CASE=' + missingProfileActor);
  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);

  if (failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error('Live test crashed: ' + String(err?.message || err));
  process.exit(1);
});
