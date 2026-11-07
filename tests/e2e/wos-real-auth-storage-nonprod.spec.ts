// Isolated WOS P7 real Auth/JWT + PRIVATE binary Storage API + 4-fact submission.
// This test is intentionally not available to Production or casual CI.
// It creates a clearly synthetic QA order and Storage PNG, retained ONLY in
// hongda-review-dev for auditing after a successful authenticated run.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

const REF = 'xulmpqaknlwqqculbsek';
const URL = 'https://' + REF + '.supabase.co';
type Identity = { client: SupabaseClient; id: string; profileId: string; orgId: string; token: string };
function assert(ok: unknown,label: string): asserts ok {
 if (!ok) throw new Error('WOS_REAL_QA_FAILED:' + label);
}
function clientFor(key: string): SupabaseClient {
 return createClient(URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
async function login(key: string,prefix: 'ADMIN'|'OPERATOR'|'FOREIGN',role: string): Promise<Identity> {
 const client=clientFor(key);
 const response=await client.auth.signInWithPassword({
  email:process.env['LIVE_TEST_'+prefix+'_EMAIL']!,
  password:process.env['LIVE_TEST_'+prefix+'_PASSWORD']!,
 });
 assert(!response.error && !!response.data.user?.id && !!response.data.session?.access_token,'PASSWORD_'+prefix);
 const id=response.data.user.id;
 const profile=await client.from('profiles').select('id,org_id,role,is_active').eq('user_id',id).single();
 assert(!profile.error && profile.data?.is_active===true && profile.data?.role===role
  && !!profile.data?.id && !!profile.data?.org_id,'PROFILE_'+prefix);
 return {client,id,profileId:profile.data.id,orgId:profile.data.org_id,token:response.data.session.access_token};
}
async function test() {
 const needed=['NEXT_PUBLIC_SUPABASE_ANON_KEY','LIVE_TEST_ADMIN_EMAIL','LIVE_TEST_ADMIN_PASSWORD',
  'LIVE_TEST_OPERATOR_EMAIL','LIVE_TEST_OPERATOR_PASSWORD','LIVE_TEST_FOREIGN_EMAIL',
  'LIVE_TEST_FOREIGN_PASSWORD'];
 assert(process.env.LIVE_TEST==='true'
  && process.env.WOS_ACK_PERSISTENT_NONPROD_QA_ORDER==='true'
  && process.env.NEXT_PUBLIC_SUPABASE_URL===URL
  && needed.every(k=>!!process.env[k]),'PINNED_PROJECT_AND_PROTECTED_CREDENTIAL_GATE');
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
 const admin=await login(key,'ADMIN','admin');
 const workshop=await login(key,'OPERATOR','operator');
 const foreign=await login(key,'FOREIGN','sales');
 try {
  assert(admin.orgId===workshop.orgId && foreign.orgId!==admin.orgId
   && new Set([admin.token,workshop.token,foreign.token]).size===3
   && new Set([admin.id,workshop.id,foreign.id]).size===3,
   'INDEPENDENT_PASSWORD_JWT_SESSIONS');
  const orderNumber='QA-NONPROD-'+randomUUID();
  const create=await admin.client.from('wos_production_orders').insert({
   organization_id:admin.orgId,customer_name_snapshot:'QA NONPRODUCTION ONLY',
   order_number:orderNumber,product_name:'QA heat transfer film',
   sales_owner_profile_id:admin.profileId,project_owner_profile_id:admin.profileId,
   priority:'MEDIUM',version_label:'V1',requested_quantity:100,current_batch_quantity:100,
   product_material:'Plastic',created_by_profile_id:admin.profileId,
  }).select('id,version,workflow_status').single();
  assert(!create.error && !!create.data?.id && create.data?.workflow_status==='DRAFT' &&
   create.data?.version===1,'SIGNED_OFFICE_DRAFT');
  const orderId=create.data.id as string;
  const imageId=randomUUID();
  const objectPath=['organizations',admin.orgId,'wos','production-order',
   orderId,'images','product','versions','V1',imageId,'qa-proof.png'].join('/');
  // Public-domain 1x1 PNG. No customer image, public URL or external payload.
  const png=Buffer.from(
   'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZ0AAAAASUVORK5CYII=',
   'base64');
  const upload=await admin.client.storage.from('wos-private')
   .upload(objectPath,png,{contentType:'image/png',upsert:false,cacheControl:'0'});
  assert(!upload.error && !!upload.data,'REAL_PRIVATE_BINARY_STORAGE_UPLOAD');
  const registry=await admin.client.rpc('wos_register_uploaded_reference_image',{
    p_order_id:orderId,p_image_id:imageId,p_category:'PRODUCT',p_storage_path:objectPath,
  });
  assert(!registry.error && registry.data?.status==='CREATED','SERVER_VERIFIED_IMAGE_REGISTRATION');
  const storageRead=await workshop.client.storage.from('wos-private').download(objectPath);
  assert(!storageRead.error && !!storageRead.data &&
   (await storageRead.data.arrayBuffer()).byteLength===png.byteLength,
   'WORKSHOP_ROLE_PRIVATE_BINARY_READ');
  const deniedForeignFile=await foreign.client.storage.from('wos-private').download(objectPath);
  assert(!!deniedForeignFile.error,'CROSS_ORG_PRIVATE_BINARY_DENIED');
  const readiness=await admin.client.rpc('wos_confirm_office_completeness',{
    p_order_id:orderId,p_expected_revision:1,p_expected_label:'V1',
    p_note:'QA office readiness: nonproduction order only',
  });
  assert(!readiness.error && !!readiness.data,'OFFICE_READINESS_CONFIRMED');
  const requestKey=randomUUID();
  const submitted=await admin.client.rpc('wos_submit_production_order',{
    p_order_id:orderId,p_expected_revision:1,p_expected_label:'V1',
    p_idempotency_key:requestKey,
  });
  assert(!submitted.error && submitted.data?.status==='CREATED' &&
   !!submitted.data?.receiptId && !!submitted.data?.inboxTaskId,
   'ATOMIC_DURABLE_SUBMIT');
  const replay=await admin.client.rpc('wos_submit_production_order',{
    p_order_id:orderId,p_expected_revision:1,p_expected_label:'V1',
    p_idempotency_key:requestKey,
  });
  assert(!replay.error && replay.data?.status==='REPLAYED' &&
   replay.data.receiptId===submitted.data.receiptId,'IDEMPOTENT_ACK_REPLAY');
  const duplicate=await admin.client.rpc('wos_submit_production_order',{
    p_order_id:orderId,p_expected_revision:1,p_expected_label:'V1',
    p_idempotency_key:randomUUID(),
  });
  // Exact SQLSTATE from the trusted P7 RPC; do not rely on a localized or
  // proxy-sanitized PostgREST error message.
  const secondSubmissionDenied = !!duplicate.error && duplicate.error.code === '40001';
  console.log('WOS_SECOND_SUBMIT_SQLSTATE_40001=' + (secondSubmissionDenied ? 'PASS' : 'FAIL'));
  assert(secondSubmissionDenied,'SAME_ORDER_SECOND_SUBMIT_DENIED');
  const inbox=await workshop.client.from('wos_workshop_inbox')
   .select('id,order_id,submission_id,workflow_status').eq('order_id',orderId);
  assert(!inbox.error && inbox.data?.length===1 &&
   inbox.data[0]?.workflow_status==='SUBMITTED' &&
   inbox.data[0]?.id===submitted.data.inboxTaskId,'WORKSHOP_SIGNED_IN_INBOX');
  const order=await workshop.client.from('wos_production_orders')
   .select('id,workflow_status,version').eq('id',orderId).single();
  assert(!order.error && order.data?.workflow_status==='SUBMITTED' &&
   order.data.version===2,'WORKSHOP_SEES_SUBMITTED_ORDER');
  const forbidden=await foreign.client.from('wos_workshop_inbox')
   .select('id').eq('order_id',orderId);
  assert(!forbidden.error && forbidden.data?.length===0,'FOREIGN_ORG_INBOX_RLS');
  const foreignSubmit=await foreign.client.rpc('wos_submit_production_order',{
   p_order_id:orderId,p_expected_revision:1,p_expected_label:'V1',
   p_idempotency_key:randomUUID(),
  });
  assert(!!foreignSubmit.error && foreignSubmit.error.code==='42501',
   'FOREIGN_ORG_SUBMIT_RPC_DENIED');
  console.log('WOS_REAL_AUTH_PRIVATE_STORAGE_E2E=PASS');
  console.log('WOS_QA_RESULT='+JSON.stringify({
    projectRef:REF,realPasswordSessions:3,privateBinaryUpload:true,
    privateWorkshopDownload:true,foreignImageDenied:true,receiptCount:1,
    workshopInboxCount:1,readiness:true,exactReplay:true,crossOrgDenied:true,
    actualProductionStarted:false,syntheticQaOrderPersisted:true,
  }));
 } finally {
  await Promise.allSettled([admin.client.auth.signOut(),workshop.client.auth.signOut(),foreign.client.auth.signOut()]);
 }
}
test().catch((error: unknown)=>{
 // Only a hard-coded assertion label is emitted, never raw Auth/HTTP errors.
 const message = error instanceof Error ? error.message : '';
 const match = /^WOS_REAL_QA_FAILED:([A-Za-z_]+)$/.exec(message);
 console.error('WOS_QA_FAILURE_STAGE=' + (match ? match[1] : 'UNCLASSIFIED'));
 console.error('WOS_REAL_AUTH_PRIVATE_STORAGE_E2E=NOT_VERIFIED_OR_FAIL');
 process.exitCode=1;
});
