// WOS P0-02-02 isolated CODE CANDIDATE. Never deploy/enable without exact-head
// independent review, a new Owner QA grant, protected Storage RLS + DB proof RPC.
// verify_jwt must remain true. No public webhooks and no Production use.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { pngValid } from './png.ts';
import { IMAGE_BUCKET, matchesCurrentOrder, parseProofRequest,
  parseTrustedSnapshot, sameStorageObject, type TrustedStorageSnapshot } from './contract.ts';

const ONLY_QA_URL = 'https://xulmpqaknlwqqculbsek.supabase.co';
const NO_CACHE = {'Cache-Control':'no-store, private','Content-Type':'application/json'};
function output(status:number,code:string,data:Record<string,unknown>|null=null) {
  return new Response(JSON.stringify({ok:status===200,code,...(data?{data}:{})}),{
    status,headers:NO_CACHE,
  });
}
function publishable():string {
  try {
    const obj=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');
    if (typeof obj.default==='string' && obj.default) return obj.default;
  } catch { /* older QA runtime */ }
  return Deno.env.get('SUPABASE_ANON_KEY')||'';
}
function secret():string {
  try {
    const obj=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
    if (typeof obj.default==='string' && obj.default) return obj.default;
  } catch { /* older QA runtime */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
}
Deno.serve(async(req:Request)=>{
  if (req.method!=='POST') return output(405,'METHOD_NOT_ALLOWED');
  if (Deno.env.get('SUPABASE_URL')!==ONLY_QA_URL
    || Deno.env.get('WOS_MVP_IMAGE_CANDIDATE_ENABLED')!=='true')
    return output(503,'NONPRODUCTION_CANDIDATE_DISABLED');
  const authorization=req.headers.get('authorization')||'';
  if (!/^Bearer [^\s]+$/.test(authorization)) return output(401,'UNAUTHENTICATED');
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')
    || Number(req.headers.get('content-length')||'0')>4096)
    return output(400,'INVALID_INPUT');
  let body: ReturnType<typeof parseProofRequest>;
  try {
    const raw=await req.text(); if (raw.length>4096) return output(400,'INVALID_INPUT');
    body=parseProofRequest(JSON.parse(raw));
  } catch { return output(400,'INVALID_INPUT'); }
  if (!body) return output(400,'INVALID_INPUT');
  const publicKey=publishable(),secretKey=secret();
  if (!publicKey || !secretKey) return output(503,'ATTESTOR_CONFIG_MISSING');
  try {
    const userDb=createClient(ONLY_QA_URL,publicKey,{
      global:{headers:{Authorization:authorization}},
      auth:{autoRefreshToken:false,persistSession:false},
    });
    const token=authorization.slice(7);
    const {data:{user},error:identityError}=await userDb.auth.getUser(token);
    if (identityError || !user?.id) return output(401,'UNAUTHENTICATED');
    // Never authorize from editable JWT user_metadata or an org ID supplied by the browser.
    const {data:actor,error:profileError}=await userDb.from('profiles')
      .select('id,user_id,org_id,role,is_active')
      .eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if (profileError || !actor || actor.user_id!==user.id
      || !['admin','manager','sales'].includes(actor.role))
      return output(403,'FORBIDDEN');
    const loadOrder=async()=>{
      const {data,error}=await userDb.from('wos_production_orders')
        .select('id,organization_id,version,version_label,workflow_status,created_by_profile_id,sales_owner_profile_id')
        .eq('id',body.orderId).eq('organization_id',actor.org_id).maybeSingle();
      return error?null:data;
    };
    const check=async()=>{
      const order=await loadOrder();
      return matchesCurrentOrder({order,actor,userId:user.id,request:body});
    };
    if (!await check()) return output(403,'ORDER_VERSION_OR_ORG_DENIED');
    // Administrative access is ONLY for restricted metadata+proof RPCs.
    // Download runs with the user's JWT, and must be denied by Storage RLS if
    // org/role/order is wrong. Never download binary with service_role.
    const admin=createClient(ONLY_QA_URL,secretKey,{
      auth:{autoRefreshToken:false,persistSession:false},
    });
    const snapshot=async():Promise<TrustedStorageSnapshot|null>=>{
      const {data,error}=await admin.rpc('wos_mvp_storage_snapshot_candidate',{
        p_storage_path:body.storagePath,
      });
      return error?null:parseTrustedSnapshot(data);
    };
    const before=await snapshot();
    if (!before || before.ownerId!==user.id) return output(409,'STORAGE_OBJECT_UNVERIFIED');
    const {data:file,error:downloadError}=await userDb.storage.from(IMAGE_BUCKET)
      .download(body.storagePath);
    if (downloadError || !file || file.size!==before.byteSize)
      return output(409,'PRIVATE_BINARY_NOT_ACCESSIBLE');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength!==before.byteSize || !await pngValid(bytes,body.sha256))
      return output(422,'PRIVATE_IMAGE_BYTES_OR_HASH_INVALID');
    const after=await snapshot();
    if (!after || !sameStorageObject(before,after))
      return output(409,'STORAGE_OBJECT_CHANGED_DURING_VERIFY');
    if (!await check()) return output(409,'ORDER_VERSION_CHANGED_DURING_VERIFY');
    // DB writer independently rechecks actor, order/version and storage object
    // identity at commit; the Edge cannot mint an unbound, browser-writable proof.
    const {data:receipt,error:commitError}=await admin.rpc('wos_mvp_commit_image_proof_candidate',{
      p_order_id:body.orderId,p_image_id:body.imageId,p_actor_user_id:user.id,
      p_expected_version:body.expectedVersion,p_storage_path:body.storagePath,
      p_verified_sha256:body.sha256,p_storage_object_id:before.id,
      p_storage_object_version:before.objectVersion,
      p_storage_updated_at:before.objectUpdatedAt,
    });
    if (commitError || receipt?.result!=='PROOF_COMMITTED'
      || receipt?.orderId!==body.orderId || receipt?.imageId!==body.imageId
      || receipt?.expectedVersion!==body.expectedVersion)
      return output(503,'TRUSTED_PROOF_COMMIT_UNVERIFIED');
    // No secret, object metadata or signed download URL leaves this function.
    return output(200,'WOS_PRIVATE_IMAGE_PROOF_VERIFIED',{
      imageId:body.imageId,expectedVersion:body.expectedVersion,sha256:body.sha256,
    });
  } catch {
    return output(503,'ATTESTOR_UNAVAILABLE');
  }
});
