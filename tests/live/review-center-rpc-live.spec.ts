// ===== Review Center Phase 2 Draft Mutation RPC Live Tests =====
// Uses real QA Admin / QA Viewer through normal authenticated clients.
// Service role is used only for read verification and final cleanup.
// Run: pnpm test:review-center:rpc:live

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

function randomSuffix(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function countWhere(client: any, table: string, column: string, value: any): Promise<number> {
  try {
    const { count, error } = await client
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, value);
    if (error) return -1;
    return count ?? 0;
  } catch {
    return -1;
  }
}

async function readRow(client: any, table: string, column: string, value: any): Promise<any> {
  try {
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq(column, value)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

async function deleteWhereService(table: string, column: string, value: any): Promise<number> {
  const { data, error } = await serviceClient
    .from(table)
    .delete()
    .eq(column, value)
    .select('*');
  if (error) throw new Error('cleanup failed for ' + table);
  return Array.isArray(data) ? data.length : 0;
}

function rpcOk(result: any): boolean {
  return !result.error && !!result.data && result.data.ok === true && result.data.code === 'OK';
}

function rpcCode(result: any): string {
  if (result.error) return 'RPC_ERROR';
  return result.data?.code ?? 'NO_DATA';
}

function assertRpcCode(result: any, expected: string, msg: string) {
  assert(!result.error && rpcCode(result) === expected, `${msg}: ${rpcCode(result)}`);
}

async function main() {
  console.log('\n=== Review Center Phase 2 RPC Live ===');

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
    ? await readRow(adminClient, 'profiles', 'user_id', adminLogin.data!.user.id)
    : null;
  const viewerProfile = viewerLoginOk
    ? await readRow(viewerClient, 'profiles', 'user_id', viewerLogin.data!.user.id)
    : null;

  const adminRoleOk = !!adminProfile && adminProfile.role === 'admin' && adminProfile.is_active === true;
  const viewerRoleOk = !!viewerProfile && viewerProfile.role === 'viewer' && viewerProfile.is_active === true;
  const sameOrg = !!adminProfile && !!viewerProfile && adminProfile.org_id === viewerProfile.org_id;
  assert(adminRoleOk, 'admin role/active');
  assert(viewerRoleOk, 'viewer role/active');
  assert(sameOrg, 'QA users same org');

  const adminOrgId = adminProfile?.org_id || '';
  const adminProfileId = adminProfile?.id || '';
  const viewerProfileId = viewerProfile?.id || '';

  const year = new Date().getFullYear();
  const reviewNo = `REV-${year}-${randomSuffix()}`;
  let reviewId = '';
  let version = 0;

  let liveGate = 'FAIL';
  let adminLoginStatus = adminLoginOk ? 'PASS' : 'FAIL';
  let viewerLoginStatus = viewerLoginOk ? 'PASS' : 'FAIL';
  let tempReviewCreated = 'NO';
  let createTriggerAudit = 'FAIL';
  let createTriggerTimeline = 'FAIL';
  let adminPublicUpdate = 'FAIL';
  let publicUpdateVersionBump = 'FAIL';
  let publicUpdateNoop = 'FAIL';
  let staleVersionConflict = 'FAIL';
  let viewerPublicUpdate = 'ALLOWED';
  let systemFieldPatch = 'ALLOWED';
  let emptyTypeDetailsFirstSave = 'WRONG';
  let realADetailsSave = 'FAIL';
  let aWithBField = 'ALLOWED';
  let reviewTypeLock = 'FAIL';
  let additionalNotesObject = 'FAIL';
  let additionalNotesClear = 'FAIL';
  let additionalNotesClearNoop = 'FAIL';
  let invalidNotesTypes = 'FAIL';
  let adminMemberAdd = 'FAIL';
  let duplicateMember = 'OTHER';
  let viewerMemberAdd = 'ALLOWED';
  let primaryMemberSet = 'FAIL';
  let primaryMemberRepeatNoop = 'FAIL';
  let primaryAtomicSwitch = 'NOT_TESTED';
  let adminMemberRemove = 'FAIL';
  let removeMissingMember = 'OTHER';
  let viewerAssignmentRpc = 'ALLOWED';
  let adminAssignmentNoop = 'FAIL';
  let ownerPmoAdvancedCases = 'NOT_TESTED';
  let directReviewUpdate = 'ALLOWED';
  let directDetailsUpdate = 'ALLOWED';
  let directMemberDml = 'ALLOWED';
  let directAuditInsert = 'ALLOWED';
  let directTimelineInsert = 'ALLOWED';
  let adminAuditRead = 'BLOCKED';
  let viewerAuditRead = 'ALLOWED';
  let adminTimelineRead = 'BLOCKED';
  let viewerTimelineRead = 'BLOCKED';
  let auditVersionChain = 'FAIL';
  let noopCreatesAudit = 'YES';
  let noopCreatesTimeline = 'YES';
  let cleanupExecuted = 'NO';
  let tempAuditAfter = 'PRESENT';
  let tempTimelineAfter = 'PRESENT';
  let tempMembersAfter = 'PRESENT';
  let tempDetailsAfter = 'PRESENT';
  let tempReviewAfter = 'PRESENT';
  let rev2026000001Touched = 'YES';

  const expectedAuditPairs: string[] = [];
  let memberId = '';

  async function recordMutation(before: number, after: number) {
    version = after;
    expectedAuditPairs.push(`${before}:${after}`);
  }

  try {
    if (!adminLoginOk || !viewerLoginOk || !adminRoleOk || !viewerRoleOk || !sameOrg) {
      throw new Error('QA setup failed');
    }
    liveGate = 'PASS';

    const revBefore = await countWhere(serviceClient, 'review_cases', 'review_no', 'REV-2026-000001');

    const created = await adminClient.from('review_cases').insert({
      org_id: adminOrgId,
      review_no: reviewNo,
      review_type: 'A',
      title: 'QA_RPC_INITIAL',
      status: 'draft',
      version: 1,
      created_by: adminProfileId,
      owner_id: adminProfileId,
    }).select('id,version').maybeSingle();

    assert(!created.error && !!created.data?.id, 'admin temp review create');
    if (created.error || !created.data?.id) throw new Error('temp review create failed');

    reviewId = created.data.id;
    version = created.data.version ?? 1;
    tempReviewCreated = 'YES';
    expectedAuditPairs.push(`null:${version}`);

    const auditAfterCreate = await countWhere(serviceClient, 'review_audit_logs', 'review_id', reviewId);
    const timelineAfterCreate = await countWhere(serviceClient, 'review_timeline_events', 'review_id', reviewId);
    createTriggerAudit = auditAfterCreate === 1 ? 'PASS' : 'FAIL';
    createTriggerTimeline = timelineAfterCreate === 1 ? 'PASS' : 'FAIL';
    assert(createTriggerAudit === 'PASS', 'create trigger audit');
    assert(createTriggerTimeline === 'PASS', 'create trigger timeline');

    const adminAuditCount = await countWhere(adminClient, 'review_audit_logs', 'review_id', reviewId);
    const viewerAuditCount = await countWhere(viewerClient, 'review_audit_logs', 'review_id', reviewId);
    const adminTimelineCount = await countWhere(adminClient, 'review_timeline_events', 'review_id', reviewId);
    const viewerTimelineCount = await countWhere(viewerClient, 'review_timeline_events', 'review_id', reviewId);
    adminAuditRead = adminAuditCount === 1 ? 'ALLOWED' : 'BLOCKED';
    viewerAuditRead = viewerAuditCount === 0 ? 'BLOCKED' : 'ALLOWED';
    adminTimelineRead = adminTimelineCount === 1 ? 'ALLOWED' : 'BLOCKED';
    viewerTimelineRead = viewerTimelineCount === 1 ? 'ALLOWED' : 'BLOCKED';
    assert(adminAuditRead === 'ALLOWED', 'admin audit read');
    assert(viewerAuditRead === 'BLOCKED', 'viewer audit blocked');
    assert(adminTimelineRead === 'ALLOWED', 'admin timeline read');
    assert(viewerTimelineRead === 'ALLOWED', 'viewer timeline read');

    // Public update
    const updateResult = await adminClient.rpc('review_update_draft_public', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { title: 'QA_RPC_UPDATED' },
    });
    adminPublicUpdate = rpcOk(updateResult) && updateResult.data?.data?.version === version + 1 ? 'PASS' : 'FAIL';
    publicUpdateVersionBump = adminPublicUpdate;
    assert(adminPublicUpdate === 'PASS', 'admin public update');
    if (adminPublicUpdate === 'PASS') {
      version += 1;
      expectedAuditPairs.push(`${version - 1}:${version}`);
    }

    const auditAfterUpdate = await countWhere(serviceClient, 'review_audit_logs', 'review_id', reviewId);
    const timelineAfterUpdate = await countWhere(serviceClient, 'review_timeline_events', 'review_id', reviewId);
    assert(auditAfterUpdate === 2, 'public update audit +1');
    assert(timelineAfterUpdate === 2, 'public update timeline +1');

    const noopUpdate = await adminClient.rpc('review_update_draft_public', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { title: 'QA_RPC_UPDATED' },
    });
    publicUpdateNoop = rpcOk(noopUpdate) && noopUpdate.data?.data?.version === version ? 'PASS' : 'FAIL';
    assert(publicUpdateNoop === 'PASS', 'public update no-op');
    const auditAfterNoop = await countWhere(serviceClient, 'review_audit_logs', 'review_id', reviewId);
    const timelineAfterNoop = await countWhere(serviceClient, 'review_timeline_events', 'review_id', reviewId);
    noopCreatesAudit = auditAfterNoop === auditAfterUpdate ? 'NO' : 'YES';
    noopCreatesTimeline = timelineAfterNoop === timelineAfterUpdate ? 'NO' : 'YES';
    assert(noopCreatesAudit === 'NO', 'no-op no audit');
    assert(noopCreatesTimeline === 'NO', 'no-op no timeline');

    const staleResult = await adminClient.rpc('review_update_draft_public', {
      p_review_id: reviewId,
      p_expected_version: 1,
      p_patch: { title: 'QA_STALE' },
    });
    staleVersionConflict = rpcCode(staleResult) === 'VERSION_CONFLICT' ? 'PASS' : 'FAIL';
    assert(staleVersionConflict === 'PASS', 'stale version conflict');

    const viewerUpdate = await viewerClient.rpc('review_update_draft_public', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { title: 'QA_VIEWER' },
    });
    viewerPublicUpdate = rpcCode(viewerUpdate) === 'FORBIDDEN' ? 'BLOCKED' : 'ALLOWED';
    assert(viewerPublicUpdate === 'BLOCKED', 'viewer public update blocked');

    const systemFields = ['owner_id', 'status', 'version', 'org_id', 'created_by'];
    let systemBlocked = true;
    for (const field of systemFields) {
      const patch: any = {};
      patch[field] = field === 'version' ? 999 : adminProfileId;
      const result = await adminClient.rpc('review_update_draft_public', {
        p_review_id: reviewId,
        p_expected_version: version,
        p_patch: patch,
      });
      if (rpcCode(result) !== 'INVALID_PATCH') systemBlocked = false;
    }
    systemFieldPatch = systemBlocked ? 'BLOCKED' : 'ALLOWED';
    assert(systemFieldPatch === 'BLOCKED', 'system field patch blocked');

    // Type details
    const emptyDetails = await adminClient.rpc('review_upsert_type_details', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: {},
    });
    if (rpcOk(emptyDetails) && emptyDetails.data?.data?.type_details === null && emptyDetails.data?.data?.version === version) {
      emptyTypeDetailsFirstSave = 'NO_OP';
    }
    assert(emptyTypeDetailsFirstSave === 'NO_OP', 'empty type details first save no-op');

    const emptyNotesFirst = await adminClient.rpc('review_upsert_type_details', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { additional_notes: {} },
    });
    assert(rpcOk(emptyNotesFirst) && emptyNotesFirst.data?.data?.type_details === null, 'empty notes first save no-op');

    const detailsBefore = await countWhere(serviceClient, 'review_type_details', 'review_id', reviewId);
    assert(detailsBefore === 0, 'no details after empty saves');

    const realDetails = await adminClient.rpc('review_upsert_type_details', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { pre_production_stage: 'QA_PRE_PRODUCTION' },
    });
    realADetailsSave = rpcOk(realDetails) && realDetails.data?.data?.version === version + 1 ? 'PASS' : 'FAIL';
    assert(realADetailsSave === 'PASS', 'real A details save');
    if (realADetailsSave === 'PASS') {
      version += 1;
      expectedAuditPairs.push(`${version - 1}:${version}`);
    }

    const detailsSame = await adminClient.rpc('review_upsert_type_details', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { pre_production_stage: 'QA_PRE_PRODUCTION' },
    });
    assert(rpcOk(detailsSame) && detailsSame.data?.data?.version === version, 'same details no-op');

    const aWithB = await adminClient.rpc('review_upsert_type_details', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { abnormal_phase: null },
    });
    aWithBField = rpcCode(aWithB) === 'INVALID_PATCH' ? 'BLOCKED' : 'ALLOWED';
    assert(aWithBField === 'BLOCKED', 'A with B field blocked');

    const typeLock = await adminClient.rpc('review_update_draft_public', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { review_type: 'B' },
    });
    reviewTypeLock = rpcCode(typeLock) === 'TYPE_MISMATCH' ? 'PASS' : 'FAIL';
    assert(reviewTypeLock === 'PASS', 'review type lock');

    const notesObject = await adminClient.rpc('review_upsert_type_details', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { additional_notes: { test: 'qa' } },
    });
    additionalNotesObject = rpcOk(notesObject) && notesObject.data?.data?.version === version + 1 ? 'PASS' : 'FAIL';
    assert(additionalNotesObject === 'PASS', 'additional notes object');
    if (additionalNotesObject === 'PASS') {
      version += 1;
      expectedAuditPairs.push(`${version - 1}:${version}`);
    }

    const notesClear = await adminClient.rpc('review_upsert_type_details', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { additional_notes: {} },
    });
    additionalNotesClear = rpcOk(notesClear) && notesClear.data?.data?.version === version + 1 ? 'PASS' : 'FAIL';
    assert(additionalNotesClear === 'PASS', 'additional notes clear');
    if (additionalNotesClear === 'PASS') {
      version += 1;
      expectedAuditPairs.push(`${version - 1}:${version}`);
    }

    const notesClearNoop = await adminClient.rpc('review_upsert_type_details', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_patch: { additional_notes: {} },
    });
    additionalNotesClearNoop = rpcOk(notesClearNoop) && notesClearNoop.data?.data?.version === version ? 'PASS' : 'FAIL';
    assert(additionalNotesClearNoop === 'PASS', 'additional notes clear no-op');

    const invalidNotes = [
      [],
      'abc',
      123,
      true,
      false,
    ];
    let invalidNotesOk = true;
    for (const value of invalidNotes) {
      const result = await adminClient.rpc('review_upsert_type_details', {
        p_review_id: reviewId,
        p_expected_version: version,
        p_patch: { additional_notes: value },
      });
      if (rpcCode(result) !== 'INVALID_PATCH') invalidNotesOk = false;
    }
    invalidNotesTypes = invalidNotesOk ? 'PASS' : 'FAIL';
    assert(invalidNotesTypes === 'PASS', 'invalid notes types rejected');

    // Members
    const addMember = await adminClient.rpc('review_add_member', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_profile_id: viewerProfileId,
      p_member_role: 'QUALITY',
    });
    adminMemberAdd = rpcOk(addMember) && addMember.data?.data?.member?.is_primary === false
      && addMember.data?.data?.version === version + 1 ? 'PASS' : 'FAIL';
    assert(adminMemberAdd === 'PASS', 'admin member add');
    if (adminMemberAdd === 'PASS') {
      memberId = addMember.data.data.member.id;
      version += 1;
      expectedAuditPairs.push(`${version - 1}:${version}`);
    }

    const duplicate = await adminClient.rpc('review_add_member', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_profile_id: viewerProfileId,
      p_member_role: 'QUALITY',
    });
    duplicateMember = rpcCode(duplicate) === 'UNIQUE_CONFLICT' ? 'UNIQUE_CONFLICT' : 'OTHER';
    assert(duplicateMember === 'UNIQUE_CONFLICT', 'duplicate member unique conflict');

    const viewerAdd = await viewerClient.rpc('review_add_member', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_profile_id: viewerProfileId,
      p_member_role: 'QUALITY',
    });
    viewerMemberAdd = rpcCode(viewerAdd) === 'FORBIDDEN' ? 'BLOCKED' : 'ALLOWED';
    assert(viewerMemberAdd === 'BLOCKED', 'viewer member add blocked');

    const setPrimary = await adminClient.rpc('review_set_primary_member', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_member_id: memberId,
    });
    primaryMemberSet = rpcOk(setPrimary) && setPrimary.data?.data?.member?.is_primary === true
      && setPrimary.data?.data?.version === version + 1 ? 'PASS' : 'FAIL';
    assert(primaryMemberSet === 'PASS', 'primary member set');
    if (primaryMemberSet === 'PASS') {
      version += 1;
      expectedAuditPairs.push(`${version - 1}:${version}`);
    }

    const primaryRepeat = await adminClient.rpc('review_set_primary_member', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_member_id: memberId,
    });
    primaryMemberRepeatNoop = rpcOk(primaryRepeat) && primaryRepeat.data?.data?.version === version ? 'PASS' : 'FAIL';
    assert(primaryMemberRepeatNoop === 'PASS', 'primary repeat no-op');

    const removeMember = await adminClient.rpc('review_remove_member', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_member_id: memberId,
    });
    adminMemberRemove = rpcOk(removeMember) && removeMember.data?.data?.removed === true
      && removeMember.data?.data?.version === version + 1 ? 'PASS' : 'FAIL';
    assert(adminMemberRemove === 'PASS', 'admin member remove');
    if (adminMemberRemove === 'PASS') {
      version += 1;
      expectedAuditPairs.push(`${version - 1}:${version}`);
    }

    const removeMissing = await adminClient.rpc('review_remove_member', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_member_id: memberId,
    });
    removeMissingMember = rpcCode(removeMissing) === 'NOT_FOUND' ? 'NOT_FOUND' : 'OTHER';
    assert(removeMissingMember === 'NOT_FOUND', 'remove missing member');

    // Assignments
    const viewerAssignment = await viewerClient.rpc('review_set_draft_assignments', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_owner_profile_id: adminProfileId,
      p_pmo_profile_id: null,
    });
    viewerAssignmentRpc = rpcCode(viewerAssignment) === 'FORBIDDEN' ? 'BLOCKED' : 'ALLOWED';
    assert(viewerAssignmentRpc === 'BLOCKED', 'viewer assignment blocked');

    const adminAssignment = await adminClient.rpc('review_set_draft_assignments', {
      p_review_id: reviewId,
      p_expected_version: version,
      p_owner_profile_id: adminProfileId,
      p_pmo_profile_id: null,
    });
    adminAssignmentNoop = rpcOk(adminAssignment) && adminAssignment.data?.data?.version === version ? 'PASS' : 'FAIL';
    assert(adminAssignmentNoop === 'PASS', 'admin assignment no-op');

    // Direct DML regression
    const directReviewUpdateResult = await adminClient.from('review_cases').update({ title: 'DIRECT_CHANGED' }).eq('id', reviewId);
    const reviewAfter = await readRow(serviceClient, 'review_cases', 'id', reviewId);
    directReviewUpdate = !!directReviewUpdateResult.error && reviewAfter?.title === 'QA_RPC_UPDATED' ? 'BLOCKED' : 'ALLOWED';
    assert(directReviewUpdate === 'BLOCKED', 'direct review update blocked');

    const directDetailsUpdateResult = await adminClient.from('review_type_details').update({ pre_production_stage: 'DIRECT' }).eq('review_id', reviewId);
    const detailsAfter = await readRow(serviceClient, 'review_type_details', 'review_id', reviewId);
    directDetailsUpdate = !!directDetailsUpdateResult.error
      && (!detailsAfter || detailsAfter.pre_production_stage === 'QA_PRE_PRODUCTION')
      ? 'BLOCKED' : 'ALLOWED';
    assert(directDetailsUpdate === 'BLOCKED', 'direct details update blocked');

    const memberInsert = await adminClient.from('review_members').insert({
      org_id: adminOrgId,
      review_id: reviewId,
      profile_id: viewerProfileId,
      member_role: 'QUALITY',
      is_primary: false,
      created_by: adminProfileId,
    });
    const memberInsertCount = await countWhere(serviceClient, 'review_members', 'review_id', reviewId);
    const memberUpdate = await adminClient.from('review_members').update({ is_primary: true }).eq('review_id', reviewId);
    const memberDelete = await adminClient.from('review_members').delete().eq('review_id', reviewId);
    const memberAfterDirect = await countWhere(serviceClient, 'review_members', 'review_id', reviewId);
    directMemberDml = !!memberInsert.error && !!memberUpdate.error && !!memberDelete.error
      && memberInsertCount === 0 && memberAfterDirect === 0 ? 'BLOCKED' : 'ALLOWED';
    assert(directMemberDml === 'BLOCKED', 'direct member DML blocked');

    const auditCountBeforeInsert = await countWhere(serviceClient, 'review_audit_logs', 'review_id', reviewId);
    const auditInsert = await adminClient.from('review_audit_logs').insert({
      org_id: adminOrgId,
      review_id: reviewId,
      entity_type: 'REVIEW',
      entity_id: reviewId,
      action: 'DIRECT_HACK',
      version_after: version,
    });
    const auditCountAfterInsert = await countWhere(serviceClient, 'review_audit_logs', 'review_id', reviewId);
    directAuditInsert = !!auditInsert.error && auditCountAfterInsert === auditCountBeforeInsert ? 'BLOCKED' : 'ALLOWED';
    assert(directAuditInsert === 'BLOCKED', 'direct audit insert blocked');

    const timelineCountBeforeInsert = await countWhere(serviceClient, 'review_timeline_events', 'review_id', reviewId);
    const timelineInsert = await adminClient.from('review_timeline_events').insert({
      org_id: adminOrgId,
      review_id: reviewId,
      event_type: 'DIRECT_HACK',
      version,
    });
    const timelineCountAfterInsert = await countWhere(serviceClient, 'review_timeline_events', 'review_id', reviewId);
    directTimelineInsert = !!timelineInsert.error && timelineCountAfterInsert === timelineCountBeforeInsert ? 'BLOCKED' : 'ALLOWED';
    assert(directTimelineInsert === 'BLOCKED', 'direct timeline insert blocked');

    // Audit/timeline version chain
    const auditRowsResult = await serviceClient
      .from('review_audit_logs')
      .select('version_before,version_after')
      .eq('review_id', reviewId);
    const timelineRowsResult = await serviceClient
      .from('review_timeline_events')
      .select('version')
      .eq('review_id', reviewId);

    const actualPairs = (auditRowsResult.data || [])
      .map((row: any) => `${row.version_before ?? 'null'}:${row.version_after}`)
      .sort();
    const expectedSorted = [...expectedAuditPairs].sort();
    const actualTimelineVersions = (timelineRowsResult.data || [])
      .map((row: any) => row.version)
      .sort((a: number, b: number) => a - b);
    const expectedTimelineVersions = expectedAuditPairs
      .map((pair: string) => Number(pair.split(':')[1]))
      .sort((a: number, b: number) => a - b);

    auditVersionChain = JSON.stringify(actualPairs) === JSON.stringify(expectedSorted)
      && JSON.stringify(actualTimelineVersions) === JSON.stringify(expectedTimelineVersions)
      ? 'PASS' : 'FAIL';
    assert(auditVersionChain === 'PASS', 'audit/timeline version chain');

    const revAfter = await countWhere(serviceClient, 'review_cases', 'review_no', 'REV-2026-000001');
    rev2026000001Touched = revAfter === revBefore && revAfter > 0 ? 'NO' : 'YES';
    assert(rev2026000001Touched === 'NO', 'REV-2026-000001 untouched');
  } catch (err: any) {
    console.error('LIVE CRASH: ' + String(err?.message || err));
  } finally {
    if (reviewId) {
      await deleteWhereService('review_audit_logs', 'review_id', reviewId);
      await deleteWhereService('review_timeline_events', 'review_id', reviewId);
      await deleteWhereService('review_members', 'review_id', reviewId);
      await deleteWhereService('review_type_details', 'review_id', reviewId);
      await deleteWhereService('review_cases', 'id', reviewId);
      cleanupExecuted = 'YES';
    }
    await serviceClient.auth.signOut();
  }

  if (reviewId) {
    tempAuditAfter = (await countWhere(serviceClient, 'review_audit_logs', 'review_id', reviewId)) === 0 ? 'MISSING' : 'PRESENT';
    tempTimelineAfter = (await countWhere(serviceClient, 'review_timeline_events', 'review_id', reviewId)) === 0 ? 'MISSING' : 'PRESENT';
    tempMembersAfter = (await countWhere(serviceClient, 'review_members', 'review_id', reviewId)) === 0 ? 'MISSING' : 'PRESENT';
    tempDetailsAfter = (await countWhere(serviceClient, 'review_type_details', 'review_id', reviewId)) === 0 ? 'MISSING' : 'PRESENT';
    tempReviewAfter = (await countWhere(serviceClient, 'review_cases', 'id', reviewId)) === 0 ? 'MISSING' : 'PRESENT';
  }

  console.log('LIVE_GATE=' + liveGate);
  console.log('ADMIN_LOGIN=' + adminLoginStatus);
  console.log('VIEWER_LOGIN=' + viewerLoginStatus);
  console.log('TEMP_REVIEW_CREATED=' + tempReviewCreated);
  console.log('CREATE_TRIGGER_AUDIT=' + createTriggerAudit);
  console.log('CREATE_TRIGGER_TIMELINE=' + createTriggerTimeline);
  console.log('ADMIN_PUBLIC_UPDATE=' + adminPublicUpdate);
  console.log('PUBLIC_UPDATE_VERSION_BUMP=' + publicUpdateVersionBump);
  console.log('PUBLIC_UPDATE_NOOP=' + publicUpdateNoop);
  console.log('STALE_VERSION_CONFLICT=' + staleVersionConflict);
  console.log('VIEWER_PUBLIC_UPDATE=' + viewerPublicUpdate);
  console.log('SYSTEM_FIELD_PATCH=' + systemFieldPatch);
  console.log('EMPTY_TYPE_DETAILS_FIRST_SAVE=' + emptyTypeDetailsFirstSave);
  console.log('REAL_A_DETAILS_SAVE=' + realADetailsSave);
  console.log('A_WITH_B_FIELD=' + aWithBField);
  console.log('REVIEW_TYPE_LOCK=' + reviewTypeLock);
  console.log('ADDITIONAL_NOTES_OBJECT=' + additionalNotesObject);
  console.log('ADDITIONAL_NOTES_CLEAR=' + additionalNotesClear);
  console.log('ADDITIONAL_NOTES_CLEAR_NOOP=' + additionalNotesClearNoop);
  console.log('INVALID_NOTES_TYPES=' + invalidNotesTypes);
  console.log('ADMIN_MEMBER_ADD=' + adminMemberAdd);
  console.log('DUPLICATE_MEMBER=' + duplicateMember);
  console.log('VIEWER_MEMBER_ADD=' + viewerMemberAdd);
  console.log('PRIMARY_MEMBER_SET=' + primaryMemberSet);
  console.log('PRIMARY_MEMBER_REPEAT_NOOP=' + primaryMemberRepeatNoop);
  console.log('PRIMARY_ATOMIC_SWITCH=' + primaryAtomicSwitch);
  console.log('ADMIN_MEMBER_REMOVE=' + adminMemberRemove);
  console.log('REMOVE_MISSING_MEMBER=' + removeMissingMember);
  console.log('VIEWER_ASSIGNMENT_RPC=' + viewerAssignmentRpc);
  console.log('ADMIN_ASSIGNMENT_NOOP=' + adminAssignmentNoop);
  console.log('OWNER_PMO_ADVANCED_CASES=' + ownerPmoAdvancedCases);
  console.log('DIRECT_REVIEW_UPDATE=' + directReviewUpdate);
  console.log('DIRECT_DETAILS_UPDATE=' + directDetailsUpdate);
  console.log('DIRECT_MEMBER_DML=' + directMemberDml);
  console.log('DIRECT_AUDIT_INSERT=' + directAuditInsert);
  console.log('DIRECT_TIMELINE_INSERT=' + directTimelineInsert);
  console.log('ADMIN_AUDIT_READ=' + adminAuditRead);
  console.log('VIEWER_AUDIT_READ=' + viewerAuditRead);
  console.log('ADMIN_TIMELINE_READ=' + adminTimelineRead);
  console.log('VIEWER_TIMELINE_READ=' + viewerTimelineRead);
  console.log('AUDIT_VERSION_CHAIN=' + auditVersionChain);
  console.log('NOOP_CREATES_AUDIT=' + noopCreatesAudit);
  console.log('NOOP_CREATES_TIMELINE=' + noopCreatesTimeline);
  console.log('CLEANUP_EXECUTED=' + cleanupExecuted);
  console.log('TEMP_AUDIT_AFTER_CLEANUP=' + tempAuditAfter);
  console.log('TEMP_TIMELINE_AFTER_CLEANUP=' + tempTimelineAfter);
  console.log('TEMP_MEMBERS_AFTER_CLEANUP=' + tempMembersAfter);
  console.log('TEMP_DETAILS_AFTER_CLEANUP=' + tempDetailsAfter);
  console.log('TEMP_REVIEW_AFTER_CLEANUP=' + tempReviewAfter);
  console.log('REV_2026_000001_TOUCHED=' + rev2026000001Touched);
  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);

  if (failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error('Live test crashed: ' + String(err?.message || err));
  process.exit(1);
});
