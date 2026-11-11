#!/usr/bin/env node
// WOS P8 protected real-branch end-to-end QA. NEVER run on Production.
// Uses only self-generated test users, synthetic order, and an original 1x1 PNG.
// Every network call and credential is confined to an exact owner-approved branch.
// It intentionally NEVER deletes a real Storage file; P8 branch deletion is separate.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';


const mode=process.argv[2] || '--self-test';
const uuid=()=>crypto.randomUUID();
const int32=(n)=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b;};
function crc32(buf) {
 let c=0xffffffff;
 for(const byte of buf){c^=byte;for(let i=0;i<8;i++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);}
 return (c^0xffffffff)>>>0;
}
function chunk(type,data=Buffer.alloc(0)) {
 const kind=Buffer.from(type,'ascii');
 return Buffer.concat([int32(data.length),kind,data,int32(crc32(Buffer.concat([kind,data])))]);
}
function syntheticPng() {
 const ihdr=Buffer.concat([int32(1),int32(1),Buffer.from([8,6,0,0,0])]);
 const rgbaRow=Buffer.from([0,255,0,0,255]); // filter 0, opaque red pixel
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rgbaRow)),chunk('IEND')]);
}
// Pure, testable safety gate; no credentials or network calls required.
const CLEANROOM_TABLES=[
 'organizations','profiles','wos_production_orders',
 'wos_reference_images','wos_submission_receipts','wos_workshop_inbox'
];
function requireCleanroomSnapshot(rowCounts,bucketNames){
 for(const table of CLEANROOM_TABLES) {
  if(rowCounts?.[table]!==0)
   throw new Error('P8_BRANCH_DIRTY_OR_SCHEMA_MISSING_'+table);
 }
 if(!Array.isArray(bucketNames))
  throw new Error('P8_BUCKET_INVENTORY_UNAVAILABLE');
 if(bucketNames.includes('wos-private'))
  throw new Error('P8_EXISTING_PRIVATE_BUCKET_REQUIRES_NEW_BRANCH');
}
const image=syntheticPng();
const sha256=crypto.createHash('sha256').update(image).digest('hex');
if(image.length<60 || image.length>1024 || !/^[a-f0-9]{64}$/.test(sha256))
 throw new Error('SYNTHETIC_PNG_SELF_TEST_FAILED');
if(mode==='--self-test'){
 const empty=Object.fromEntries(CLEANROOM_TABLES.map(table=>[table,0]));
 requireCleanroomSnapshot(empty,[]);
 let rejected=0;
 for(const [counts,buckets] of [
  [{...empty,profiles:1},[]],
  [{...empty,wos_workshop_inbox:null},[]],
  [empty,['wos-private']]
 ]){
  try{requireCleanroomSnapshot(counts,buckets);}
  catch{rejected++;}
 }
 if(rejected!==3)throw new Error('P8_DIRTY_BRANCH_FAIL_CLOSED_REGRESSION');
 console.log('WOS_P8_DIRTY_QA_OR_EXISTING_BUCKET_REFUSED=PASS');
 console.log('WOS_P8_REAL_BROWSER_BRANCH_HARNESS_STATIC_PNG=PASS');
 console.log('WOS_P8_REMOTE_STORAGE_AND_EDGE=NOT_RUN');
 process.exit(0);
}
if(mode!=='--run')throw new Error('USE_SELF_TEST_OR_RUN');
const e=process.env,ref=e.WOS_P8_BRANCH_REF || '';
if(!/^[a-z0-9]{20}$/.test(ref) || ref==='amqpvxrurenevniilhtl'
 || ref!==e.WOS_P8_APPROVED_BRANCH_REF
 || e.WOS_P8_QA_RUN_ACK!=='SYNTHETIC_ONLY_NO_FILE_DELETE'
 || e.WOS_P8_PROJECT_URL!=='https://'+ref+'.supabase.co'
 || !e.WOS_P8_PUBLISHABLE_KEY || !e.WOS_P8_SERVICE_ROLE_KEY
 || !/^[a-f0-9]{40}$/.test(e.WOS_P8_REVIEWED_SHA||'')) {
 throw new Error('P8_EXACT_APPROVED_NONPROD_BRANCH_OR_SECRETS_NOT_PRESENT');
}
const live=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(live!==e.WOS_P8_REVIEWED_SHA)throw new Error('UNREVIEWED_CODE_SHA');
const { createClient } = await import('@supabase/supabase-js');
const url=e.WOS_P8_PROJECT_URL;
const admin=createClient(url,e.WOS_P8_SERVICE_ROLE_KEY,{
 auth:{autoRefreshToken:false,persistSession:false}
});
function assert(value,message){if(!value)throw new Error(message);}
async function required(promise,label){
 const {data,error}=await promise;
 if(error)throw new Error(label+': '+error.code);
 return data;
}
function publicClient(){
 return createClient(url,e.WOS_P8_PUBLISHABLE_KEY,{
  auth:{autoRefreshToken:false,persistSession:false}
 });
}
async function createIdentity(org,role){
 const email='wos-p8-'+uuid()+'@example.invalid';
 const password=crypto.randomBytes(32).toString('base64url');
 const user=await required(admin.auth.admin.createUser({
  email,password,email_confirm:true
 }),'CREATE_SYNTHETIC_AUTH_USER');
 const profile=await required(admin.from('profiles').insert({
  user_id:user.user.id,org_id:org,role,is_active:true,
  full_name:'WOS P8 synthetic '+role
 }).select('id,user_id,org_id,role').single(),'CREATE_SYNTHETIC_PROFILE');
 const client=publicClient();
 const session=await required(client.auth.signInWithPassword({email,password}),
  'SIGN_IN_SYNTHETIC_USER');
 assert(session.session?.access_token,'NO_REAL_AUTH_SESSION');
 return {client,userId:user.user.id,profile,token:session.session.access_token};
}
async function callEdge(token,orderId,imageId,storagePath,sha) {
 const response=await fetch(url+'/functions/v1/wos-p8-verify-image',{
  method:'POST',headers:{
   'authorization':'Bearer '+token,
   'apikey':e.WOS_P8_PUBLISHABLE_KEY,
   'content-type':'application/json'
  },
  body:JSON.stringify({orderId,imageId,storagePath,sha256:sha})
 });
 return {status:response.status,body:await response.json()};
}
// The P8 runner is intentionally one-shot. Reject pre-existing objects and
// business rows BEFORE any synthetic Auth, organization, order or binary write.
// A reused QA branch (including hongda-review-dev) is never a cleanroom.
async function requireEmptyDisposableBranch() {
 const counts={};
 for(const table of CLEANROOM_TABLES) {
  const {count,error}=await admin.from(table)
   .select('id',{count:'exact',head:true});
  if(error)throw new Error('P8_BRANCH_SCHEMA_QUERY_FAILED_'+table);
  counts[table]=count;
 }
 const {data:buckets,error:bucketError}=await admin.storage.listBuckets();
 if(bucketError)throw new Error('P8_BUCKET_INVENTORY_UNAVAILABLE');
 requireCleanroomSnapshot(counts,buckets?.map(bucket=>bucket.name));
 console.log('WOS_P8_ZERO_DATA_AND_PRIVATE_BUCKET_ABSENT=PASS');
}
async function main(){
 await requireEmptyDisposableBranch();
 const orgA=uuid(),orgB=uuid(),orderId=uuid(),imageId=uuid();
 await required(admin.from('organizations').insert([
  {id:orgA,name:'WOS P8 NONPROD synthetic A'},
  {id:orgB,name:'WOS P8 NONPROD synthetic B'}
 ]),'CREATE_SYNTHETIC_ORGS');
 const a=await createIdentity(orgA,'admin');
 const b=await createIdentity(orgB,'admin');
 const viewer=await createIdentity(orgA,'viewer');
 const order=await required(admin.from('wos_production_orders').insert({
  id:orderId,organization_id:orgA,customer_name_snapshot:'SYNTHETIC-NONPROD',
  order_number:'WOS-P8-SYNTH-'+orderId,product_name:'Synthetic test cup',
  sales_owner_profile_id:a.profile.id,project_owner_profile_id:a.profile.id,
  created_by_profile_id:a.profile.id,priority:'LOW',version_label:'V1',
  requested_quantity:10,current_batch_quantity:10,product_material:'SYNTHETIC'
 }).select('id,version,workflow_status').single(),'CREATE_SYNTHETIC_DRAFT');
 assert(order.version===1 && order.workflow_status==='DRAFT','UNEXPECTED_ORDER_INIT');
 await required(admin.storage.createBucket('wos-private',{
  public:false,fileSizeLimit:20*1024*1024,allowedMimeTypes:['image/png']
 }),'CREATE_ISOLATED_PRIVATE_BUCKET');
 const path='organizations/'+orgA+'/wos/production-order/'+orderId+
   '/images/product/versions/V1/'+imageId+'/proof.png';
 await required(a.client.storage.from('wos-private').upload(path,image,{
  contentType:'image/png',upsert:false,cacheControl:'0'
 }),'REAL_OWNER_UPLOAD');
 const downloaded=await required(a.client.storage.from('wos-private').download(path),
  'REAL_OWNER_DOWNLOAD');
 const actual=crypto.createHash('sha256')
   .update(Buffer.from(await downloaded.arrayBuffer())).digest('hex');
 assert(actual===sha256,'UPLOADED_AND_DOWNLOADED_BYTES_DIFFER');

 // Proof must be unavailable until the real Edge verifier checks bytes.
 const unproven=await a.client.rpc('wos_register_uploaded_reference_image',{
  p_order_id:orderId,p_image_id:imageId,p_category:'PRODUCT',p_storage_path:path
 });
 assert(!!unproven.error,'UNPROVEN_BINARY_WAS_ACCEPTED');
 const foreignRead=await b.client.storage.from('wos-private').download(path);
 const viewerRead=await viewer.client.storage.from('wos-private').download(path);
 assert(!!foreignRead.error && !!viewerRead.error,'CROSS_ORG_OR_VIEWER_STORAGE_LEAK');
 const wrong=await callEdge(a.token,orderId,imageId,path,'0'.repeat(64));
 assert(wrong.status===422,'WRONG_SHA_WAS_NOT_REJECTED');
 const foreignVerify=await callEdge(b.token,orderId,imageId,path,sha256);
 assert(foreignVerify.status===403,'FOREIGN_ORG_PROOF_NOT_DENIED');
 const verified=await callEdge(a.token,orderId,imageId,path,sha256);
 assert(verified.status===200 && verified.body?.code==='P8_PRIVATE_BINARY_VERIFIED',
  'REAL_EDGE_VERIFIER_FAILED: '+verified.status);
 const retry=await callEdge(a.token,orderId,imageId,path,sha256);
 assert(retry.status===200,'VERIFICATION_IDEMPOTENT_RETRY_FAILED');
 const registered=await required(a.client.rpc('wos_register_uploaded_reference_image',{
  p_order_id:orderId,p_image_id:imageId,p_category:'PRODUCT',p_storage_path:path
 }),'REGISTER_VERIFIED_REFERENCE');
 assert(['CREATED','REPLAYED'].includes(registered.status),'IMAGE_REGISTER_STATE');
 await required(a.client.rpc('wos_confirm_office_completeness',{
  p_order_id:orderId,p_expected_revision:1,p_expected_label:'V1',
  p_note:'P8 synthetic signed-off office readiness'
 }),'CONFIRM_OFFICE');
 const key=uuid();
 const submitted=await required(a.client.rpc('wos_submit_production_order',{
  p_order_id:orderId,p_expected_revision:1,p_expected_label:'V1',
  p_idempotency_key:key
 }),'SUBMIT_ATOMIC');
 assert(submitted.status==='CREATED','ATOMIC_CREATE_FAILED');
 const replay=await required(a.client.rpc('wos_submit_production_order',{
  p_order_id:orderId,p_expected_revision:1,p_expected_label:'V1',
  p_idempotency_key:key
 }),'IDEMPOTENCY_REPLAY');
 assert(replay.status==='REPLAYED','IDEMPOTENCY_REPLAY_FAILED');
 const {count,error:countError}=await admin.from('wos_workshop_inbox')
   .select('id',{count:'exact',head:true}).eq('order_id',orderId);
 assert(!countError && count===1,'INBOX_MUST_HAVE_ONE_ROW');
 // Failure recovery uses a fake lease row only: no Storage object, no byte deletion.
 const claimId=uuid();
 const claimedAt=new Date(Date.now()-30*60_000).toISOString();
 const expiredAt=new Date(Date.now()-25*60_000).toISOString();
 await required(admin.from('wos_orphan_cleanup_claims').insert({
  storage_object_id:claimId,storage_path:'synthetic/no-real-storage-object/'+claimId,
  order_id:orderId,organization_id:orgA,object_updated_at:claimedAt,
  claim_token:uuid(),state:'CLAIMED',claimed_at:claimedAt,
  lease_expires_at:expiredAt
 }),'SYNTHETIC_EXPIRED_LEASE');
 const released=await required(admin.rpc('wos_p7_release_expired_claims',{p_limit:100}),
  'RECOVER_EXPIRED_LEASE');
 assert(released>=1,'EXPIRED_LEASE_NOT_RELEASED');
 console.log('WOS_P8_REAL_STORAGE_UPLOAD_AND_BYTE_SHA256=PASS');
 console.log('WOS_P8_CROSS_ORG_AND_VIEWER_DENIAL=PASS');
 console.log('WOS_P8_REAL_EDGE_ATTESTATION_AND_RETRY=PASS');
 console.log('WOS_P8_ATOMIC_RECEIPT_AND_IDEMPOTENCY=PASS');
 console.log('WOS_P8_RECOVERY_LEASE_RELEASE_NO_FILE_DELETE=PASS');
 console.log('WOS_P8_BINARY_DELETE=NOT_RUN; REQUIRES SEPARATE AUTHORIZATION');
 console.log('WOS_P8_BRANCH_CLEANUP_REQUIRED=YES');
}
await main();
