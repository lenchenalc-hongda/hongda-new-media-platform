// WOS P7 isolated-QA only. NO Production, no real client images.
// The browser cannot mint this proof; only this audited Edge Function can.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const QA_URL='https://xulmpqaknlwqqculbsek.supabase.co';
const MAX_FILE=20*1024*1024,MAX_PIXELS=16*1024*1024,MAX_RAW=64*1024*1024;
const MAGIC=new Uint8Array([137,80,78,71,13,10,26,10]);
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const sha=/^[0-9a-f]{64}$/;
const NO_CACHE={'Cache-Control':'no-store, private','Content-Type':'application/json'};
function output(code:string,status:number,extra:Record<string,unknown>={}) {
  return new Response(JSON.stringify({ok:status===200,code,...extra}),{status,headers:NO_CACHE});
}
const crcTable=Uint32Array.from({length:256},(_,i)=>{
  let c=i;
  for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(buf:Uint8Array):number {
  let c=0xffffffff;
  for(const byte of buf)c=crcTable[(c^byte)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function u32(v:Uint8Array,i:number) {
  return (((v[i]<<24)>>>0)+(v[i+1]<<16)+(v[i+2]<<8)+v[i+3])>>>0;
}
async function pngValid(bytes:Uint8Array,expectedSha:string):Promise<boolean>{
  if(bytes.length<60||bytes.length>MAX_FILE) return false;
  if(!MAGIC.every((v,i)=>bytes[i]===v))return false;
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==expectedSha)return false;
  let off=8,chunks=0,header=false,seenData=false,ended=false,idatEnded=false;
  let width=0,height=0,channels=0;
  const compressed:Uint8Array[]=[];
  let compressedSize=0;
  while(off<bytes.length&&chunks++<1000) {
    if(off+12>bytes.length)return false;
    const n=u32(bytes,off),kind=String.fromCharCode(...bytes.subarray(off+4,off+8));
    const end=off+8+n;
    if(n>MAX_FILE||end+4>bytes.length||!/^[A-Za-z]{4}$/.test(kind)
      ||crc32(bytes.subarray(off+4,end))!==u32(bytes,end))return false;
    if(!header&&kind!=='IHDR')return false;
    if(kind==='IHDR'){
      if(header||n!==13||chunks!==1)return false;
      width=u32(bytes,off+8);height=u32(bytes,off+12);
      const depth=bytes[off+16],color=bytes[off+17];
      if(!width||!height||width*height>MAX_PIXELS||depth!==8
        ||![0,2,4,6].includes(color)||bytes[off+18]!==0
        ||bytes[off+19]!==0||bytes[off+20]!==0)return false;
      channels=({0:1,2:3,4:2,6:4} as Record<number,number>)[color];
      header=true;
    }else if(kind==='IDAT'){
      if(ended||idatEnded||n===0)return false;
      compressed.push(bytes.subarray(off+8,end));
      compressedSize+=n;if(compressedSize>MAX_FILE)return false;
      seenData=true;
    }else if(kind==='IEND'){
      if(!seenData||ended||n!==0||end+4!==bytes.length)return false;
      ended=true;
    }else{
      if(seenData)idatEnded=true;
      if(kind==='acTL'||kind==='fcTL'||kind==='fdAT'
        ||kind.charCodeAt(0)>=65&&kind.charCodeAt(0)<=90)return false;
    }
    off=end+4;
  }
  if(!ended||!header||!seenData||off!==bytes.length)return false;
  const rowBytes=1+width*channels,expected=rowBytes*height;
  if(!Number.isSafeInteger(expected)||expected>MAX_RAW)return false;
  const input=new Uint8Array(compressedSize);
  let at=0;for(const chunk of compressed){input.set(chunk,at);at+=chunk.length;}
  try{
    // Streaming inflation with an exact maximum, to avoid zip bombs.
    const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(input);c.close();}})
      .pipeThrough(new DecompressionStream('deflate'));
    const reader=stream.getReader();let produced=0;
    const raw=new Uint8Array(expected);
    while(true){
      const part=await reader.read();
      if(part.done)break;
      if(produced+part.value.length>expected){await reader.cancel();return false;}
      raw.set(part.value,produced);produced+=part.value.length;
    }
    if(produced!==expected)return false;
    for(let row=0;row<height;row++)if(raw[row*rowBytes]>4)return false;
    return true;
  }catch{return false;}
}
function secretKey():string{
  const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(legacy)return legacy;
  try {
    const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
    return typeof keys.default==='string'?keys.default:'';
  }catch{return '';}
}
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return output('METHOD_NOT_ALLOWED',405);
  if(Deno.env.get('SUPABASE_URL')!==QA_URL)return output('QA_PROJECT_PIN_FAILED',503);
  const h=req.headers.get('authorization')||'';
  if(!/^Bearer [^\s]+$/.test(h))return output('UNAUTHENTICATED',401);
  if(!req.headers.get('content-type')?.startsWith('application/json'))return output('INVALID_INPUT',400);
  const key=Deno.env.get('SUPABASE_ANON_KEY')||'',serverKey=secretKey();
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
