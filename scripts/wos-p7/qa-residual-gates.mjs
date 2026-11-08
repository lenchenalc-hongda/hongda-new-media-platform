// WOS P7 residual QA-only gates. Never production, never service-role, never delete.
// Secrets are supplied only to a reviewed, owner-approved GitHub Environment job.
// No Auth tokens, passwords, cookies, private paths, or response bodies are logged.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const QA_URL = 'https://xulmpqaknlwqqculbsek.supabase.co';
const APPROVED_QA_SHA = '29f908a0b32b530d551886e3ce4b6a0762f86cdc';
const WORKFLOW_FILE = '.github/workflows/wos-p7-residual-protected-qa.yml';
const ORPHAN_LABEL = 'WOS P7 QA DISPOSABLE ORPHAN';
const mode = process.argv[2] || '';
let stage = 'PRECHECK';

function permitted() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'ACTIONS_ONLY');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/master', 'PROTECTED_MASTER_ONLY');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'MANUAL_ONLY');
  assert.equal(process.env.QA_APPROVED_SHA, APPROVED_QA_SHA, 'REVIEWED_SOURCE_PIN_REQUIRED');
  assert.equal(process.env.QA_PROJECT_URL, QA_URL, 'ISOLATED_QA_ONLY');
  assert.notEqual(process.env.VERCEL_ENV, 'production', 'NO_PRODUCTION_RUNTIME');
  assert(process.env.REVIEW_DEV_SUPABASE_ANON_KEY, 'QA_ANON_KEY_REQUIRED');
  assert(!process.env.SUPABASE_SERVICE_ROLE_KEY, 'SERVICE_ROLE_FORBIDDEN');
}

function verifyContract() {
  const s = readFileSync(WORKFLOW_FILE, 'utf8');
  assert(s.includes('APPROVED_QA_SHA: ' + APPROVED_QA_SHA));
  assert(/^on:\n  workflow_dispatch:/m.test(s));
  assert(!/^  (push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):/m.test(s));
  assert(s.includes("GITHUB_REF\" = 'refs/heads/master'"));
  assert(s.includes('environment: hongda-review-dev'));
  assert(s.includes('persist-credentials: false'));
  assert(s.includes('EXPECTED_SCRIPT_BLOB: '));
  assert(s.includes('git hash-object scripts/wos-p7/qa-residual-gates.mjs'));
  assert(s.includes('QA_APPROVED_SHA: ' + APPROVED_QA_SHA));
  assert(s.includes('QA_PROJECT_URL: ' + QA_URL));
  assert(s.includes('secrets.REVIEW_DEV_SUPABASE_ANON_KEY'));
  assert(s.includes('secrets.REVIEW_DEV_VIEWER_PASSWORD'));
  assert(s.includes('secrets.REVIEW_DEV_ADMIN_PASSWORD'));
  assert(!s.includes('secrets.SUPABASE_SERVICE_ROLE_KEY'));
  assert(!s.includes('WOS_P7_QA_ORPHAN_DELETE_ENABLED'));
  assert(!s.includes('QA_ORPHAN_DELETE_ACK'));
  assert(!s.includes('mode: execute'));
  assert(s.includes('timeout-minutes: 140'));
  const modes = ['jwt', 'seed', 'dryrun'];
  for (const m of modes) assert(s.includes('mode == \'' + m + '\''));
  console.log('WOS_P7_RESIDUAL_SECRETLESS_STATIC_CONTRACT=PASS');
  console.log('WOS_P7_RESIDUAL_MODES=JWT_NATURAL_EXPIRY_ORPHAN_SEED_DRYRUN');
  console.log('WOS_P7_RESIDUAL_PHYSICAL_DELETE=NOT_SUPPORTED');
}

function client() {
  const key = process.env.REVIEW_DEV_SUPABASE_ANON_KEY;
  return createClient(QA_URL, key, {
    auth: {autoRefreshToken:false, persistSession:false, detectSessionInUrl:false}
  });
}

async function login(role) {
  const email = process.env['REVIEW_DEV_' + role + '_EMAIL'];
  const password = process.env['REVIEW_DEV_' + role + '_PASSWORD'];
  assert(email && password, 'QA_CREDENTIALS_REQUIRED');
  const c = client();
  const {data,error} = await c.auth.signInWithPassword({email,password});
  assert(!error && data?.user?.id && data?.session?.access_token, 'REAL_QA_LOGIN_REQUIRED');
  return {c,session:data.session,user:data.user};
}

async function bearerStatus(token) {
  // Probe GoTrue directly: no Supabase JS refresh hooks on this frozen JWT.
  const response = await fetch(QA_URL + '/auth/v1/user', {
    method:'GET', cache:'no-store',
    headers:{
      apikey:process.env.REVIEW_DEV_SUPABASE_ANON_KEY,
      Authorization:'Bearer ' + token
    },
    signal:AbortSignal.timeout(25000)
  });
  return response.status; // Never read/log the user response body.
}

async function verifyViewerWosRls(token) {
  // WOS UI/API role denials are not enough: test direct PostgREST bypass too.
  for (const table of ['wos_production_orders','wos_reference_images',
    'wos_submission_receipts','wos_workshop_inbox']) {
    const response = await fetch(QA_URL + '/rest/v1/' + table + '?select=id&limit=1', {
      method:'GET', cache:'no-store',
      headers:{
        apikey:process.env.REVIEW_DEV_SUPABASE_ANON_KEY,
        Authorization:'Bearer ' + token
      },
      signal:AbortSignal.timeout(25000)
    });
    if(response.status===200) {
      const rows=await response.json();
      assert(Array.isArray(rows) && rows.length===0,'VIEWER_DIRECT_WOS_TABLE_READABLE');
    } else {
      assert([401,403].includes(response.status),'WOS_RLS_UNEXPECTED_RESPONSE');
    }
  }
  console.log('WOS_P7_VIEWER_DIRECT_POSTGREST_RLS_DENIED=PASS');
}

async function runNaturalJwtExpiry() {
  stage='JWT_REAL_LOGIN';
  const {c,session,user} = await login('VIEWER');
  const expiresAt = Number(session.expires_at) * 1000;
  const remaining = expiresAt - Date.now();
  assert(Number.isFinite(expiresAt) && remaining > 120000, 'JWT_EXPIRY_METADATA_INVALID');
  assert(remaining < 110 * 60 * 1000, 'JWT_LIFETIME_EXCEEDS_PROTECTED_JOB_BUDGET');
  assert.equal(await bearerStatus(session.access_token), 200, 'FRESH_JWT_MUST_WORK');
  const profile=await c.from('profiles').select('role,is_active').eq('user_id',user.id).single();
  assert(!profile.error && profile.data?.role==='viewer' && profile.data?.is_active===true,
    'EXPECTED_ISOLATED_VIEWER_REQUIRED');
  await verifyViewerWosRls(session.access_token);
  console.log('WOS_P7_REAL_JWT_PRE_EXPIRY_AUTH=PASS');
  console.log('WOS_P7_REAL_JWT_TTL_SECONDS=' + Math.floor(remaining/1000));
  stage='JWT_NATURAL_TIME_PASSAGE';
  // Do not alter JWT TTL, fake clock, force logout, or use forced refresh.
  await new Promise(resolve=>setTimeout(resolve, Math.max(0, expiresAt-Date.now()+20000)));
  assert(Date.now()>expiresAt,'JWT_WALL_CLOCK_NOT_EXPIRED');
  stage='EXPIRED_TOKEN_MUST_REJECT';
  let status=await bearerStatus(session.access_token);
  if(status===200) {
    await new Promise(resolve=>setTimeout(resolve,35000));
    status=await bearerStatus(session.access_token);
  }
  assert([401,403].includes(status),'OLD_JWT_STILL_AUTHENTICATED');
  console.log('WOS_P7_REAL_JWT_NATURAL_EXPIRY_DENIED=PASS');
  stage='POST_EXPIRY_REFRESH';
  const {data:refreshed,error:refreshError}=await c.auth.refreshSession({refresh_token:session.refresh_token});
  assert(!refreshError && refreshed?.session?.access_token && refreshed?.user?.id===user.id,'POST_EXPIRY_REFRESH_FAILED');
  assert.notEqual(refreshed.session.access_token,session.access_token,'OLD_JWT_REUSED');
  assert.equal(await bearerStatus(refreshed.session.access_token),200,'REFRESHED_JWT_NOT_ACCEPTED');
  await verifyViewerWosRls(refreshed.session.access_token);
  assert([401,403].includes(await bearerStatus(session.access_token)),'EXPIRED_JWT_RESURRECTED');
  console.log('WOS_P7_REAL_JWT_REFRESH_AFTER_EXPIRY=PASS');
  console.log('WOS_P7_REAL_JWT_NATURAL_EXPIRY_GATE=PASS');
}

async function runSeedOrphan() {
  stage='QA_SYNTHETIC_SEED_AUTH';
  assert.equal(process.env.QA_DISPOSABLE_SEED_ACK,'WOS_P7_ISOLATED_SYNTHETIC_ONLY','EXPLICIT_DISPOSABLE_SEED_ACK_REQUIRED');
  const {c,user}=await login('ADMIN');
  const profile = await c.from('profiles').select('id,org_id,role,is_active')
    .eq('user_id',user.id).eq('is_active',true).single();
  assert(!profile.error && profile.data?.role==='admin' && profile.data?.org_id && profile.data?.id,'REAL_QA_ADMIN_REQUIRED');
  const p=profile.data;
  const existing=await c.from('wos_production_orders').select('id')
    .eq('organization_id',p.org_id).eq('product_name',ORPHAN_LABEL)
    .eq('workflow_status','DRAFT').limit(2);
  assert(!existing.error && Array.isArray(existing.data) && existing.data.length===0,'DISPOSABLE_ORPHAN_ALREADY_SEEDED');
  stage='QA_CREATE_DISPOSABLE_DRAFT';
  const orderNumber='QA-NONPROD-'+randomUUID();
  const draft=await c.from('wos_production_orders').insert({
    organization_id:p.org_id,
    customer_name_snapshot:'QA NONPRODUCTION ONLY',
    order_number:orderNumber,
    product_name:ORPHAN_LABEL,
    sales_owner_profile_id:p.id,
    project_owner_profile_id:p.id,
    created_by_profile_id:p.id,
    priority:'LOW',
    version_label:'V1',
    requested_quantity:1,
    current_batch_quantity:1,
    product_material:'SYNTHETIC QA TEST MATERIAL'
  }).select('id,created_at,workflow_status').single();
  assert(!draft.error && draft.data?.id && draft.data.workflow_status==='DRAFT','DISPOSABLE_DRAFT_NOT_CREATED');
  const orderId=draft.data.id;
  const imgId=randomUUID();
  const path=['organizations',p.org_id,'wos','production-order',orderId,
    'images','product','versions','V1',imgId,'qa-disposable-orphan.png'].join('/');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
  stage='QA_UPLOAD_UNREGISTERED_PRIVATE_IMAGE';
  const upload=await c.storage.from('wos-private').upload(path,bytes,{
    contentType:'image/png',upsert:false,cacheControl:'0'
  });
  assert(!upload.error,'DISPOSABLE_STORAGE_UPLOAD_FAILED');
  stage='QA_VERIFY_PHYSICAL_ORPHAN';
  const downloaded=await c.storage.from('wos-private').download(path);
  assert(!downloaded.error && downloaded.data,'DISPOSABLE_STORAGE_BINARY_MISSING');
  const actual=Buffer.from(await downloaded.data.arrayBuffer());
  const sha=x=>createHash('sha256').update(x).digest('hex');
  assert.equal(sha(actual),sha(bytes),'DISPOSABLE_BYTES_CHANGED');
  const registration=await c.from('wos_reference_images').select('id',{count:'exact',head:true})
    .eq('storage_path',path);
  assert(!registration.error && registration.count===0,'DISPOSABLE_IMAGE_ALREADY_REGISTERED');
  const receipts=await c.from('wos_submission_receipts').select('id',{count:'exact',head:true}).eq('order_id',orderId);
  assert(!receipts.error && receipts.count===0,'DISPOSABLE_ORDER_UNEXPECTEDLY_SUBMITTED');
  console.log('WOS_P7_DISPOSABLE_ORDER_ID='+orderId); // Synthetic ID only; never print private path/org/token.
  console.log('WOS_P7_DISPOSABLE_ORPHAN_CREATED_AT='+draft.data.created_at);
  console.log('WOS_P7_DISPOSABLE_ORPHAN_REQUIRES_REAL_24H_AGING=YES');
  console.log('WOS_P7_DISPOSABLE_ORPHAN_PHYSICAL_BINARY_UNREGISTERED=PASS');
  console.log('WOS_P7_DISPOSABLE_ORPHAN_DELETE_PERFORMED=NO');
}

async function runDryrun() {
  stage='QA_ADMIN_DRYRUN_LOGIN';
  const {c}=await login('ADMIN');
  const expected=Number(process.env.QA_EXPECTED_CANDIDATES);
  assert([0,1].includes(expected),'EXPECTED_CANDIDATES_NOT_ALLOWLISTED');
  stage='QA_ORPHAN_EDGE_DRYRUN';
  const {data,error}=await c.functions.invoke('wos-p7-orphan-cleanup',{
    body:{mode:'dry_run',minAgeHours:24}
  });
  assert(!error && data?.code==='QA_ORPHAN_DRY_RUN' && data?.ok===true,'EDGE_DRYRUN_FAILED');
  assert.equal(data.deleted,0,'DRYRUN_DELETED_OBJECTS');
  assert.equal(data.minimumAgeHours,24,'RETENTION_TOO_SHORT');
  assert.equal(data.candidates,expected,'WRONG_ORPHAN_CANDIDATE_COUNT');
  console.log('WOS_P7_QA_ORPHAN_24H_CANDIDATES='+expected);
  console.log('WOS_P7_QA_ORPHAN_EDGE_DRYRUN_NO_DELETE=PASS');
}

async function main() {
  if(mode==='self-test') {verifyContract();return;}
  assert(['jwt','seed','dryrun'].includes(mode),'MODE_ALLOWLIST_ONLY');
  permitted();
  if(mode==='jwt') await runNaturalJwtExpiry();
  else if(mode==='seed') await runSeedOrphan();
  else await runDryrun();
}
main().catch(e=>{
  const kind=e?.name==='AssertionError'?'ASSERTION':e?.name==='TimeoutError'?'TIMEOUT':'ERROR';
  // Never log arbitrary SDK errors: they can contain credentials or URLs.
  console.error('WOS_P7_RESIDUAL_FAILURE_STAGE='+stage);
  console.error('WOS_P7_RESIDUAL_FAILURE_CLASS='+kind);
  process.exitCode=1;
});
