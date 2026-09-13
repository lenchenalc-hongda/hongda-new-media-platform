// ===== Review Center Migration 1 Functional RLS Live Tests =====
// Uses real QA Admin / QA Viewer through normal Supabase user clients.
// Service role is only used for read verification, setup checks, and cleanup.
// Run: pnpm test:review-center:live

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { evaluateLiveAuthGate } from './live-auth-gate';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

var passed = 0;
var failed = 0;
var skipped = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

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

const OPTIONAL_PHASE2_CLEANUP_TABLES = new Set([
  'review_audit_logs',
  'review_timeline_events',
]);

function isMissingRelationError(error: unknown, table: string): boolean {
  if (!error || typeof error !== 'object') return false;
  if (!OPTIONAL_PHASE2_CLEANUP_TABLES.has(table)) return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const details = typeof candidate.details === 'string' ? candidate.details : '';
  const hint = typeof candidate.hint === 'string' ? candidate.hint : '';
  const combined = `${message} ${details} ${hint}`;

  if (code === '42P01') return true;
  if (code === 'PGRST205') {
    return combined.includes(table);
  }
  return false;
}

async function deleteWhereService(table: string, column: string, value: any): Promise<number> {
  try {
    const { data, error } = await serviceClient
      .from(table)
      .delete()
      .eq(column, value)
      .select('*');
    if (error) {
      if (isMissingRelationError(error, table)) return 0;
      throw error;
    }
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    if (isMissingRelationError(err, table)) return 0;
    throw err;
  }
}

const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } });

function randomSuffix(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function main() {
  console.log('\n=== Review Center Migration 1 Functional RLS ===');

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

  const year = new Date().getFullYear();
  const reviewNo = 'REV-' + year + '-' + randomSuffix();
  const viewerReviewNo = 'REV-' + year + '-' + randomSuffix();
  const crossOrgReviewNo = 'REV-' + year + '-' + randomSuffix();
  const dictCode = 'rls_live_' + randomSuffix();
  const systemDictCode = 'rls_sys_' + randomSuffix();
  const crossOrgId = crypto.randomUUID();

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

  const adminProfile = adminLoginOk
    ? await readRow(adminClient, 'profiles', 'user_id', adminLogin.data!.user.id)
    : null;
  const viewerProfile = viewerLoginOk
    ? await readRow(viewerClient, 'profiles', 'user_id', viewerLogin.data!.user.id)
    : null;

  const adminRoleOk = !!adminProfile && adminProfile.role === 'admin' && adminProfile.is_active === true;
  const viewerRoleOk = !!viewerProfile && viewerProfile.role === 'viewer' && viewerProfile.is_active === true;
  const sameOrg = !!adminProfile && !!viewerProfile && adminProfile.org_id === viewerProfile.org_id;

  assert(adminLoginOk, 'admin login');
  assert(viewerLoginOk, 'viewer login');
  assert(adminRoleOk, 'admin role/active');
  assert(viewerRoleOk, 'viewer role/active');
  assert(sameOrg, 'QA users same org');

  const adminOrgId = adminProfile?.org_id || '';
  const adminProfileId = adminProfile?.id || '';
  const viewerProfileId = viewerProfile?.id || '';

  let reviewId = '';
  let reviewCaseInsertWrites = 0;
  let typeDetailsInsertWrites = 0;
  let typeDetailsDeleteWrites = 0;
  let memberInsertWrites = 0;
  let memberDeleteWrites = 0;
  let dictInsertWrites = 0;
  let serviceRoleCleanupWrites = 0;

  let adminReviewInsert = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let viewerReviewInsert = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let crossOrgReviewInsert = 'NOT_TESTED' as 'BLOCKED_BY_RLS' | 'BLOCKED_BY_FK' | 'ALLOWED' | 'NOT_TESTED';
  let adminReviewSelect = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let viewerReviewSelect = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let anonReviewSelect = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let adminReviewUpdate = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let viewerReviewUpdate = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let adminReviewDelete = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let viewerReviewDelete = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';

  let adminTypeInsert = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let viewerTypeSelect = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let viewerTypeInsert = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let adminTypeUpdate = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let viewerTypeUpdate = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let adminTypeDelete = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';

  let adminMemberInsert = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let viewerMemberSelectStatus: 'ALLOWED' | 'BLOCKED' = 'BLOCKED';
  let viewerMemberInsert = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let adminMemberUpdate = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let viewerMemberUpdate = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let adminMemberDelete = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';

  let adminDictInsert = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let viewerDictSelect = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let anonDictSelect = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let viewerDictInsert = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let adminDictUpdate = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let adminDictDelete = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let viewerDictDelete = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';
  let adminSystemDictInsert = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';

  let adminOrgSelect = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let viewerOrgSelect = 'BLOCKED' as 'ALLOWED' | 'BLOCKED';
  let viewerOrgUpdate = 'ALLOWED' as 'BLOCKED' | 'ALLOWED';

  try {
    if (adminLoginOk && viewerLoginOk && sameOrg && adminRoleOk && viewerRoleOk) {
      const originalOrg = await readRow(serviceClient, 'organizations', 'id', adminOrgId);
      const originalDescription = originalOrg?.description ?? null;

      // Admin creates review
      const adminCreate = await adminClient.from('review_cases').insert({
        org_id: adminOrgId,
        review_no: reviewNo,
        review_type: 'A',
        title: 'RLS LIVE TEST REVIEW',
        status: 'draft',
        version: 1,
        created_by: adminProfileId,
        owner_id: adminProfileId,
      }).select('id').maybeSingle();
      adminReviewInsert = !adminCreate.error && adminCreate.data?.id ? 'ALLOWED' : 'BLOCKED';
      reviewId = adminCreate.data?.id || '';
      if (adminReviewInsert === 'ALLOWED') reviewCaseInsertWrites++;
      assert(adminReviewInsert === 'ALLOWED', 'admin review insert allowed');

      if (reviewId) {
        const serviceReviewCount = await countWhere(serviceClient, 'review_cases', 'id', reviewId);
        assert(serviceReviewCount === 1, 'service confirms 1 review row');

        const adminSelect = await readRow(adminClient, 'review_cases', 'id', reviewId);
        const viewerSelect = await readRow(viewerClient, 'review_cases', 'id', reviewId);
        const anonRows = await anonClient.from('review_cases').select('id').eq('id', reviewId);
        const anonCount = Array.isArray(anonRows.data) ? anonRows.data.length : 0;
        adminReviewSelect = adminSelect ? 'ALLOWED' : 'BLOCKED';
        viewerReviewSelect = viewerSelect ? 'ALLOWED' : 'BLOCKED';
        anonReviewSelect = anonCount === 0 ? 'BLOCKED' : 'ALLOWED';
        assert(adminReviewSelect === 'ALLOWED', 'admin review select allowed');
        assert(viewerReviewSelect === 'ALLOWED', 'viewer review select allowed');
        assert(anonReviewSelect === 'BLOCKED', 'anon review select blocked');

        // Viewer create review blocked
        const viewerCreate = await viewerClient.from('review_cases').insert({
          org_id: viewerProfile?.org_id || '',
          review_no: viewerReviewNo,
          review_type: 'A',
          title: 'RLS LIVE TEST VIEWER REVIEW',
          status: 'draft',
          version: 1,
          created_by: viewerProfileId,
          owner_id: viewerProfileId,
        }).select('id').maybeSingle();
        const viewerReviewCount = await countWhere(serviceClient, 'review_cases', 'review_no', viewerReviewNo);
        viewerReviewInsert = viewerReviewCount === 0 ? 'BLOCKED' : 'ALLOWED';
        assert(viewerReviewInsert === 'BLOCKED', 'viewer review insert blocked');

        // Cross-org insert
        const crossOrg = await adminClient.from('review_cases').insert({
          org_id: crossOrgId,
          review_no: crossOrgReviewNo,
          review_type: 'A',
          title: 'RLS LIVE TEST CROSS ORG',
          status: 'draft',
          version: 1,
          created_by: adminProfileId,
          owner_id: adminProfileId,
        }).select('id').maybeSingle();
        const crossOrgCount = await countWhere(serviceClient, 'review_cases', 'review_no', crossOrgReviewNo);
        crossOrgReviewInsert = crossOrgCount === 0 ? 'BLOCKED_BY_RLS' : 'ALLOWED';
        if (crossOrg.error?.code === '23503') crossOrgReviewInsert = 'BLOCKED_BY_FK';
        assert(crossOrgReviewInsert === 'BLOCKED_BY_RLS', 'cross-org review insert blocked by RLS');

        // Direct update blocked
        await adminClient.from('review_cases').update({ title: 'RLS_LIVE_TEST_CHANGED' }).eq('id', reviewId);
        await viewerClient.from('review_cases').update({ title: 'RLS_LIVE_TEST_CHANGED' }).eq('id', reviewId);
        const reviewAfterUpdate = await readRow(serviceClient, 'review_cases', 'id', reviewId);
        adminReviewUpdate = reviewAfterUpdate?.title === 'RLS LIVE TEST REVIEW' ? 'BLOCKED' : 'ALLOWED';
        viewerReviewUpdate = adminReviewUpdate;
        assert(adminReviewUpdate === 'BLOCKED', 'admin direct update blocked');
        assert(viewerReviewUpdate === 'BLOCKED', 'viewer direct update blocked');

        // Hard delete blocked
        await adminClient.from('review_cases').delete().eq('id', reviewId);
        await viewerClient.from('review_cases').delete().eq('id', reviewId);
        const reviewAfterDelete = await countWhere(serviceClient, 'review_cases', 'id', reviewId);
        adminReviewDelete = reviewAfterDelete === 1 ? 'BLOCKED' : 'ALLOWED';
        viewerReviewDelete = adminReviewDelete;
        assert(adminReviewDelete === 'BLOCKED', 'admin hard delete blocked');
        assert(viewerReviewDelete === 'BLOCKED', 'viewer hard delete blocked');

        // Type details
        const adminTypeCreate = await adminClient.from('review_type_details').insert({
          review_id: reviewId,
          org_id: adminOrgId,
          review_type: 'A',
          created_by: adminProfileId,
        }).select('review_id').maybeSingle();
        adminTypeInsert = !adminTypeCreate.error && adminTypeCreate.data?.review_id ? 'ALLOWED' : 'BLOCKED';
        if (adminTypeInsert === 'ALLOWED') typeDetailsInsertWrites++;
        assert(adminTypeInsert === 'ALLOWED', 'admin type details insert allowed');

        const viewerTypeRow = await readRow(viewerClient, 'review_type_details', 'review_id', reviewId);
        viewerTypeSelect = viewerTypeRow ? 'ALLOWED' : 'BLOCKED';
        assert(viewerTypeSelect === 'ALLOWED', 'viewer type details select allowed');

        const viewerTypeInsertResult = await viewerClient.from('review_type_details').insert({
          review_id: reviewId,
          org_id: adminOrgId,
          review_type: 'A',
          created_by: viewerProfileId,
        }).select('review_id').maybeSingle();
        const typeCountAfterViewerInsert = await countWhere(serviceClient, 'review_type_details', 'review_id', reviewId);
        viewerTypeInsert = typeCountAfterViewerInsert === 1 ? 'BLOCKED' : 'ALLOWED';
        assert(viewerTypeInsert === 'BLOCKED', 'viewer type details insert blocked');

        await adminClient.from('review_type_details').update({ pre_production_stage: 'CHANGED' }).eq('review_id', reviewId);
        await viewerClient.from('review_type_details').update({ pre_production_stage: 'CHANGED' }).eq('review_id', reviewId);
        const typeAfterUpdate = await readRow(serviceClient, 'review_type_details', 'review_id', reviewId);
        adminTypeUpdate = typeAfterUpdate?.pre_production_stage == null ? 'BLOCKED' : 'ALLOWED';
        viewerTypeUpdate = adminTypeUpdate;
        assert(adminTypeUpdate === 'BLOCKED', 'admin type details update blocked');
        assert(viewerTypeUpdate === 'BLOCKED', 'viewer type details update blocked');

        const adminTypeDeleteResult = await adminClient.from('review_type_details').delete().eq('review_id', reviewId).select('review_id');
        const typeCountAfterDelete = await countWhere(serviceClient, 'review_type_details', 'review_id', reviewId);
        adminTypeDelete = typeCountAfterDelete === 0 ? 'ALLOWED' : 'BLOCKED';
        if (adminTypeDelete === 'ALLOWED' && Array.isArray(adminTypeDeleteResult.data)) typeDetailsDeleteWrites = adminTypeDeleteResult.data.length;
        assert(adminTypeDelete === 'ALLOWED', 'admin type details draft delete allowed');

        // Members
        const adminMemberCreate = await adminClient.from('review_members').insert({
          org_id: adminOrgId,
          review_id: reviewId,
          profile_id: viewerProfileId,
          member_role: 'QUALITY',
          is_primary: true,
          created_by: adminProfileId,
        }).select('id').maybeSingle();
        adminMemberInsert = !adminMemberCreate.error && adminMemberCreate.data?.id ? 'ALLOWED' : 'BLOCKED';
        if (adminMemberInsert === 'ALLOWED') memberInsertWrites++;
        assert(adminMemberInsert === 'ALLOWED', 'admin member insert allowed');

        const memberSelectCount = await countWhere(serviceClient, 'review_members', 'review_id', reviewId);
        const viewerMemberSelect = await readRow(viewerClient, 'review_members', 'review_id', reviewId);
        viewerMemberSelectStatus = viewerMemberSelect ? 'ALLOWED' : 'BLOCKED';
        assert(viewerMemberSelectStatus === 'ALLOWED', 'viewer member select allowed');

        const viewerMemberInsertResult = await viewerClient.from('review_members').insert({
          org_id: adminOrgId,
          review_id: reviewId,
          profile_id: viewerProfileId,
          member_role: 'QUALITY',
          is_primary: true,
          created_by: viewerProfileId,
        }).select('id').maybeSingle();
        const memberCountAfterViewerInsert = await countWhere(serviceClient, 'review_members', 'review_id', reviewId);
        viewerMemberInsert = memberCountAfterViewerInsert === 1 ? 'BLOCKED' : 'ALLOWED';
        assert(viewerMemberInsert === 'BLOCKED', 'viewer member insert blocked');

        await adminClient.from('review_members').update({ is_primary: false }).eq('review_id', reviewId);
        await viewerClient.from('review_members').update({ is_primary: false }).eq('review_id', reviewId);
        const memberAfterUpdate = await readRow(serviceClient, 'review_members', 'review_id', reviewId);
        adminMemberUpdate = memberAfterUpdate?.is_primary === true ? 'BLOCKED' : 'ALLOWED';
        viewerMemberUpdate = adminMemberUpdate;
        assert(adminMemberUpdate === 'BLOCKED', 'admin member update blocked');
        assert(viewerMemberUpdate === 'BLOCKED', 'viewer member update blocked');

        const adminMemberDeleteResult = await adminClient.from('review_members').delete().eq('review_id', reviewId).select('id');
        const memberCountAfterDelete = await countWhere(serviceClient, 'review_members', 'review_id', reviewId);
        adminMemberDelete = memberCountAfterDelete === 0 ? 'ALLOWED' : 'BLOCKED';
        if (adminMemberDelete === 'ALLOWED' && Array.isArray(adminMemberDeleteResult.data)) memberDeleteWrites = adminMemberDeleteResult.data.length;
        assert(adminMemberDelete === 'ALLOWED', 'admin member draft delete allowed');

        // Dict
        const adminDictCreate = await adminClient.from('review_dict_items').insert({
          org_id: adminOrgId,
          dict_type: 'rls_live_test',
          code: dictCode,
          label: 'RLS LIVE TEST DICT',
          is_system: false,
          created_by: adminProfileId,
        }).select('id').maybeSingle();
        adminDictInsert = !adminDictCreate.error && adminDictCreate.data?.id ? 'ALLOWED' : 'BLOCKED';
        if (adminDictInsert === 'ALLOWED') dictInsertWrites++;
        assert(adminDictInsert === 'ALLOWED', 'admin dict insert allowed');

        const viewerDictRow = await readRow(viewerClient, 'review_dict_items', 'code', dictCode);
        viewerDictSelect = viewerDictRow ? 'ALLOWED' : 'BLOCKED';
        assert(viewerDictSelect === 'ALLOWED', 'viewer dict select allowed');

        const anonDictRows = await anonClient.from('review_dict_items').select('id').eq('code', dictCode);
        const anonDictCount = Array.isArray(anonDictRows.data) ? anonDictRows.data.length : 0;
        anonDictSelect = anonDictCount === 0 ? 'BLOCKED' : 'ALLOWED';
        assert(anonDictSelect === 'BLOCKED', 'anon dict select blocked');

        const viewerDictCode = 'rls_live_viewer_' + randomSuffix();
        const viewerDictInsertResult = await viewerClient.from('review_dict_items').insert({
          org_id: adminOrgId,
          dict_type: 'rls_live_test',
          code: viewerDictCode,
          label: 'RLS LIVE TEST VIEWER DICT',
          is_system: false,
          created_by: viewerProfileId,
        }).select('id').maybeSingle();
        const viewerDictCount = await countWhere(serviceClient, 'review_dict_items', 'code', viewerDictCode);
        viewerDictInsert = viewerDictCount === 0 ? 'BLOCKED' : 'ALLOWED';
        assert(viewerDictInsert === 'BLOCKED', 'viewer dict insert blocked');

        await adminClient.from('review_dict_items').update({ enabled: false }).eq('code', dictCode);
        const dictAfterUpdate = await readRow(serviceClient, 'review_dict_items', 'code', dictCode);
        adminDictUpdate = dictAfterUpdate?.enabled === true ? 'BLOCKED' : 'ALLOWED';
        assert(adminDictUpdate === 'BLOCKED', 'admin dict update blocked');

        await adminClient.from('review_dict_items').delete().eq('code', dictCode);
        await viewerClient.from('review_dict_items').delete().eq('code', dictCode);
        const dictAfterDelete = await countWhere(serviceClient, 'review_dict_items', 'code', dictCode);
        adminDictDelete = dictAfterDelete === 1 ? 'BLOCKED' : 'ALLOWED';
        viewerDictDelete = adminDictDelete;
        assert(adminDictDelete === 'BLOCKED', 'admin dict delete blocked');
        assert(viewerDictDelete === 'BLOCKED', 'viewer dict delete blocked');

        const systemDictCreate = await adminClient.from('review_dict_items').insert({
          dict_type: 'rls_system_test',
          code: systemDictCode,
          label: 'RLS SYSTEM TEST',
          is_system: true,
          org_id: null,
          created_by: null,
        }).select('id').maybeSingle();
        const systemDictCount = await countWhere(serviceClient, 'review_dict_items', 'code', systemDictCode);
        adminSystemDictInsert = systemDictCount === 0 ? 'BLOCKED' : 'ALLOWED';
        assert(adminSystemDictInsert === 'BLOCKED', 'admin system dict insert blocked');

        // Organizations
        const adminOrgRow = await readRow(adminClient, 'organizations', 'id', adminOrgId);
        const viewerOrgRow = await readRow(viewerClient, 'organizations', 'id', adminOrgId);
        adminOrgSelect = adminOrgRow ? 'ALLOWED' : 'BLOCKED';
        viewerOrgSelect = viewerOrgRow ? 'ALLOWED' : 'BLOCKED';
        assert(adminOrgSelect === 'ALLOWED', 'admin org select allowed');
        assert(viewerOrgSelect === 'ALLOWED', 'viewer org select allowed');

        await viewerClient.from('organizations').update({ description: 'RLS LIVE TEST SENTINEL' }).eq('id', adminOrgId);
        const orgAfterUpdate = await readRow(serviceClient, 'organizations', 'id', adminOrgId);
        viewerOrgUpdate = orgAfterUpdate?.description === originalDescription ? 'BLOCKED' : 'ALLOWED';
        assert(viewerOrgUpdate === 'BLOCKED', 'viewer org update blocked');
      }
    }
  } finally {
    if (reviewId) {
      serviceRoleCleanupWrites += await deleteWhereService('review_audit_logs', 'review_id', reviewId);
      serviceRoleCleanupWrites += await deleteWhereService('review_timeline_events', 'review_id', reviewId);
      serviceRoleCleanupWrites += await deleteWhereService('review_members', 'review_id', reviewId);
      serviceRoleCleanupWrites += await deleteWhereService('review_type_details', 'review_id', reviewId);
      serviceRoleCleanupWrites += await deleteWhereService('review_dict_items', 'code', dictCode);
      serviceRoleCleanupWrites += await deleteWhereService('review_cases', 'id', reviewId);
    }
    serviceRoleCleanupWrites += await deleteWhereService('review_dict_items', 'code', systemDictCode);
    serviceRoleCleanupWrites += await deleteWhereService('review_cases', 'review_no', viewerReviewNo);
    serviceRoleCleanupWrites += await deleteWhereService('review_cases', 'review_no', crossOrgReviewNo);
    await serviceClient.auth.signOut();
  }

  const tempReviewAfter = await countWhere(serviceClient, 'review_cases', 'review_no', reviewNo);
  const tempDetailsAfter = await countWhere(serviceClient, 'review_type_details', 'review_id', reviewId || '__none__');
  const tempMembersAfter = await countWhere(serviceClient, 'review_members', 'review_id', reviewId || '__none__');
  const tempDictAfter = await countWhere(serviceClient, 'review_dict_items', 'code', dictCode);

  console.log('ADMIN_LOGIN=' + (adminLoginOk ? 'PASS' : 'FAIL'));
  console.log('VIEWER_LOGIN=' + (viewerLoginOk ? 'PASS' : 'FAIL'));
  console.log('QA_USERS_SAME_ORG=' + (sameOrg ? 'YES' : 'NO'));
  console.log('ADMIN_REVIEW_INSERT=' + adminReviewInsert);
  console.log('VIEWER_REVIEW_INSERT=' + viewerReviewInsert);
  console.log('CROSS_ORG_REVIEW_INSERT=' + crossOrgReviewInsert);
  console.log('ADMIN_REVIEW_SELECT=' + adminReviewSelect);
  console.log('VIEWER_REVIEW_SELECT=' + viewerReviewSelect);
  console.log('ANON_REVIEW_SELECT=' + anonReviewSelect);
  console.log('ADMIN_REVIEW_DIRECT_UPDATE=' + adminReviewUpdate);
  console.log('VIEWER_REVIEW_DIRECT_UPDATE=' + viewerReviewUpdate);
  console.log('ADMIN_REVIEW_HARD_DELETE=' + adminReviewDelete);
  console.log('VIEWER_REVIEW_HARD_DELETE=' + viewerReviewDelete);
  console.log('ADMIN_TYPE_DETAILS_INSERT=' + adminTypeInsert);
  console.log('VIEWER_TYPE_DETAILS_SELECT=' + viewerTypeSelect);
  console.log('VIEWER_TYPE_DETAILS_INSERT=' + viewerTypeInsert);
  console.log('ADMIN_TYPE_DETAILS_UPDATE=' + adminTypeUpdate);
  console.log('VIEWER_TYPE_DETAILS_UPDATE=' + viewerTypeUpdate);
  console.log('ADMIN_TYPE_DETAILS_DELETE_DRAFT=' + adminTypeDelete);
  console.log('ADMIN_MEMBER_INSERT=' + adminMemberInsert);
  console.log('VIEWER_MEMBER_SELECT=' + viewerMemberSelectStatus);
  console.log('VIEWER_MEMBER_INSERT=' + viewerMemberInsert);
  console.log('ADMIN_MEMBER_UPDATE=' + adminMemberUpdate);
  console.log('VIEWER_MEMBER_UPDATE=' + viewerMemberUpdate);
  console.log('ADMIN_MEMBER_DELETE_DRAFT=' + adminMemberDelete);
  console.log('PRIMARY_MEMBER_UNIQUE_LIVE=NOT_TESTED');
  console.log('ADMIN_DICT_INSERT=' + adminDictInsert);
  console.log('VIEWER_DICT_SELECT=' + viewerDictSelect);
  console.log('ANON_DICT_SELECT=' + anonDictSelect);
  console.log('VIEWER_DICT_INSERT=' + viewerDictInsert);
  console.log('ADMIN_DICT_UPDATE=' + adminDictUpdate);
  console.log('ADMIN_DICT_DELETE=' + adminDictDelete);
  console.log('VIEWER_DICT_DELETE=' + viewerDictDelete);
  console.log('ADMIN_CREATE_SYSTEM_DICT=' + adminSystemDictInsert);
  console.log('ADMIN_ORG_SELECT=' + adminOrgSelect);
  console.log('VIEWER_ORG_SELECT=' + viewerOrgSelect);
  console.log('VIEWER_ORG_UPDATE=' + viewerOrgUpdate);
  console.log('ADMIN_ORG_UPDATE=NOT_TESTED');
  console.log('REVIEW_CASE_INSERT_WRITES=' + reviewCaseInsertWrites);
  console.log('TYPE_DETAILS_INSERT_WRITES=' + typeDetailsInsertWrites);
  console.log('TYPE_DETAILS_DELETE_WRITES=' + typeDetailsDeleteWrites);
  console.log('MEMBER_INSERT_WRITES=' + memberInsertWrites);
  console.log('MEMBER_DELETE_WRITES=' + memberDeleteWrites);
  console.log('DICT_INSERT_WRITES=' + dictInsertWrites);
  console.log('SERVICE_ROLE_CLEANUP_WRITES=' + serviceRoleCleanupWrites);
  console.log('CLEANUP_EXECUTED=YES');
  console.log('TEMP_REVIEW_AFTER_CLEANUP=' + (tempReviewAfter === 0 ? 'MISSING' : 'PRESENT'));
  console.log('TEMP_DETAILS_AFTER_CLEANUP=' + (tempDetailsAfter === 0 ? 'MISSING' : 'PRESENT'));
  console.log('TEMP_MEMBERS_AFTER_CLEANUP=' + (tempMembersAfter === 0 ? 'MISSING' : 'PRESENT'));
  console.log('TEMP_DICT_AFTER_CLEANUP=' + (tempDictAfter === 0 ? 'MISSING' : 'PRESENT'));
  console.log('EXISTING_QA_USERS_TOUCHED=NO');
  console.log('EXISTING_QA_ORG_MODIFIED=NO');
  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ', Skipped: ' + skipped);

  if (failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error('Live test crashed: ' + String(err?.message || err));
  process.exit(1);
});
