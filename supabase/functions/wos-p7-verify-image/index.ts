// WOS P7 isolated-QA only. NO Production, no real client images.
// The browser cannot mint this proof; only this audited Edge Function can.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { pngValid } from './png.ts';

const QA_URL='https://xulmpqaknlwqqculbsek.supabase.co';
const MAX_FILE=20*1024*1024;
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const sha=/^[0-9a-f]{64}$/;
const NO_CACHE={'Cache-Control':'no-store, private','Content-Type':'application/json'};
function output(code:string,status:number,extra:Record<string,unknown>={}) {
  return new Response(JSON.stringify({ok:status===200,code,...extra}),{status,headers:NO_CACHE});
}
function secretKey():string{
  try{
    const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
    if(typeof keys.default==='string'&&keys.default)return keys.default;
  }catch{ /* older isolated QA runtime */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
}
function publicKey():string{
  try{
    const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');
    if(typeof keys.default==='string'&&keys.default)return keys.default;
  }catch{ /* older isolated QA runtime */ }
  return Deno.env.get('SUPABASE_ANON_KEY')||'';
}
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return output('METHOD_NOT_ALLOWED',405);
  if(Deno.env.get('SUPABASE_URL')!==QA_URL)return output('QA_PROJECT_PIN_FAILED',503);
  const h=req.headers.get('authorization')||'';
  if(!/^Bearer [^\s]+$/.test(h))return output('UNAUTHENTICATED',401);
  if(!req.headers.get('content-type')?.startsWith('application/json'))return output('INVALID_INPUT',400);
  const key=publicKey(),serverKey=secretKey();
  if(!key||!serverKey)return output('QA_SERVER_CONFIG_INCOMPLETE',503);
  let body:Record<string,unknown>;
  try{
    const text=await req.text();if(text.length>4096)return output('INVALID_INPUT',400);
    const value=JSON.parse(text);
    if(!value||Array.isArray(value)||typeof value!=='object')return output('INVALID_INPUT',400);
    body=value;
  }catch{return output('INVALID_INPUT',400);}
  if(Object.keys(body).sort().join(',')!=='imageId,orderId,sha256,storagePath'
    ||typeof body.imageId!=='string'||!uuid.test(body.imageId)
    ||typeof body.orderId!=='string'||!uuid.test(body.orderId)
    ||typeof body.sha256!=='string'||!sha.test(body.sha256)
    ||typeof body.storagePath!=='string'||body.storagePath.length>600)
    return output('INVALID_INPUT',400);
  try {
    const token=h.substring(7);
    const userDb=createClient(QA_URL,key,{global:{headers:{Authorization:h}},
      auth:{autoRefreshToken:false,persistSession:false}});
    const {data:{user},error:authErr}=await userDb.auth.getUser(token);
    if(authErr||!user?.id)return output('UNAUTHENTICATED',401);
    const {data:profile,error:pe}=await userDb.from('profiles')
      .select('id,user_id,org_id,role,is_active').eq('user_id',user.id)
      .eq('is_active',true).maybeSingle();
    if(pe||!profile||!['admin','manager','sales'].includes(profile.role))
      return output('FORBIDDEN',403);
    const {data:order,error:oe}=await userDb.from('wos_production_orders')
      .select('id,organization_id,created_by_profile_id,sales_owner_profile_id,order_number,version_label,workflow_status')
      .eq('id',body.orderId).eq('organization_id',profile.org_id).maybeSingle();
    if(oe||!order||order.workflow_status!=='DRAFT'
      ||!/^QA-NONPROD-[a-f0-9-]{36}$/i.test(order.order_number)
      ||!/^V[1-9][0-9]{0,20}$/.test(order.version_label)
      ||(profile.role==='sales'&&profile.id!==order.created_by_profile_id
         &&profile.id!==order.sales_owner_profile_id))return output('FORBIDDEN',403);
    const path=['organizations',profile.org_id,'wos','production-order',order.id,
      'images','product','versions',order.version_label,body.imageId,'qa-preview-proof.png'].join('/');
    if(body.storagePath!==path)return output('INVALID_IMAGE_PATH',400);
    const admin=createClient(QA_URL,serverKey,{auth:{autoRefreshToken:false,persistSession:false}});
    // Restricted DB RPC callable ONLY by service_role. It never returns bytes.
    const snapshot=async()=>{
      const {data,error}=await admin.rpc('wos_qa_get_storage_object_for_proof',{p_path:path});
      if(error||!data?.id)return null;
      return data as {id:string,ownerId:string,version:string|null,updatedAt:string,
        mimeType:string,byteSize:string};
    };
    const first=await snapshot();
    if(!first||first.ownerId!==user.id||first.mimeType!=='image/png'
      ||!first.updatedAt||!uuid.test(first.id)
      ||!Number.isSafeInteger(Number(first.byteSize))
      ||Number(first.byteSize)<60||Number(first.byteSize)>MAX_FILE)
      return output('PRIVATE_OBJECT_NOT_VERIFIED',409);
    // User-scoped download must pass the same Storage RLS as a browser request.
    const {data:file,error:downloadError}=await userDb.storage.from('wos-private').download(path);
    if(downloadError||!file||file.size!==Number(first.byteSize))return output('PRIVATE_BINARY_MISSING',409);
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!await pngValid(bytes,body.sha256 as string))return output('QA_BINARY_INTEGRITY_FAILED',422);
    const second=await snapshot();
    if(!second||second.id!==first.id||second.version!==first.version
      ||second.updatedAt!==first.updatedAt||second.ownerId!==first.ownerId)
      return output('OBJECT_CHANGED_DURING_VERIFICATION',409);
    // Proof row is an internal DB credential, never exposed to the client.
    const now=Date.now(),created=new Date(now).toISOString(),expires=new Date(now+10*60*1000).toISOString();
    const {error:writeError}=await admin.from('wos_qa_verified_image_proofs').upsert({
      image_id:body.imageId,order_id:order.id,organization_id:profile.org_id,
      actor_user_id:user.id,storage_bucket:'wos-private',storage_path:path,
      storage_object_id:first.id,storage_object_version:first.version,
      storage_object_updated_at:first.updatedAt,verified_sha256:body.sha256,
      verified_at:created,expires_at:expires,
    },{onConflict:'image_id'});
    if(writeError)return output('QA_PROOF_WRITE_UNAVAILABLE',503);
    return output('QA_TRUSTED_IMAGE_PROOF_ISSUED',200,{data:{sha256:body.sha256}});
  } catch{return output('QA_ATTESTATION_UNAVAILABLE',503);}
});
