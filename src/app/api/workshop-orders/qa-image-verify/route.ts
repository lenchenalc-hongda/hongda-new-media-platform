import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { isApprovedWosSandboxUrl, isWosNonproductionApiEnabled } from '@/lib/workshop-orders/api-contract';
import { verifyWosSyntheticPngBinary } from '@/lib/workshop-orders/qa-image-validation';

// Synthetic QA ONLY. No service-role key, no Production registration or upload.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noCache = { 'Cache-Control':'no-store, private' };
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const sha=/^[0-9a-f]{64}$/;
const disabled=()=>!isWosNonproductionApiEnabled({
  vercelEnv:process.env.VERCEL_ENV,
  nodeEnv:process.env.NODE_ENV,
  enabled:process.env.WOS_P5C_NONPROD_API_ENABLED,
}) || process.env.WOS_P7_NONPROD_SUBMIT_ENABLED!=='true'
  || !isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const fail=(code:string,status:number)=>NextResponse.json({ok:false,code},
  {status,headers:noCache});

export async function POST(req:NextRequest) {
  if(disabled()) return fail('NONPRODUCTION_ONLY_DISABLED',503);
  if(!req.headers.get('content-type')?.startsWith('application/json')) return fail('INVALID_INPUT',400);
  const len=Number(req.headers.get('content-length')||'0');
  if(!Number.isFinite(len)||len>4096) return fail('INVALID_INPUT',400);
  let body:unknown;
  try { const raw=await req.text();if(raw.length>4096) return fail('INVALID_INPUT',400);body=JSON.parse(raw); }
  catch { return fail('INVALID_INPUT',400); }
  if(!body || typeof body!=='object'||Array.isArray(body))return fail('INVALID_INPUT',400);
  const x=body as Record<string,unknown>;
  if(Object.keys(x).sort().join(',')!=='imageId,orderId,sha256,storagePath'
     || typeof x.imageId!=='string'||!uuid.test(x.imageId)
     || typeof x.orderId!=='string'||!uuid.test(x.orderId)
     || typeof x.sha256!=='string'||!sha.test(x.sha256)
     || typeof x.storagePath!=='string'||x.storagePath.length>600)
    return fail('INVALID_INPUT',400);
  try {
    const client=await createClient();if(!client)return fail('DATABASE_UNAVAILABLE',503);
    const identity=await resolveVerifiedSupabaseIdentity(client);
    if(!identity)return fail('UNAUTHENTICATED',401);
    const profile=await client.from('profiles')
      .select('id,org_id,role,is_active').eq('user_id',identity.id).eq('is_active',true).maybeSingle();
    if(profile.error||!profile.data || !['admin','manager','sales'].includes(profile.data.role))
      return fail('FORBIDDEN',403);
    const order=await client.from('wos_production_orders')
      .select('id,organization_id,created_by_profile_id,sales_owner_profile_id,order_number,version_label,workflow_status')
      .eq('id',x.orderId).eq('organization_id',profile.data.org_id).maybeSingle();
    if(order.error||!order.data||order.data.workflow_status!=='DRAFT'
      || !/^QA-NONPROD-[0-9a-f-]{36}$/i.test(order.data.order_number)
      || !/^V[1-9][0-9]{0,20}$/.test(order.data.version_label)
      || (profile.data.role==='sales' && profile.data.id!==order.data.created_by_profile_id
        && profile.data.id!==order.data.sales_owner_profile_id))return fail('FORBIDDEN',403);
    const expected=['organizations',profile.data.org_id,'wos','production-order',
      order.data.id,'images','product','versions',order.data.version_label,
      x.imageId,'qa-preview-proof.png'].join('/');
    if(x.storagePath!==expected)return fail('INVALID_IMAGE_PATH',400);
    // Download as the actual user: Storage RLS checks org, order and role.
    // No administrative or service-role Storage access is used here.
    const downloaded=await client.storage.from('wos-private').download(expected);
    if(downloaded.error||!downloaded.data || downloaded.data.size===0
      ||downloaded.data.size>20*1024*1024)return fail('IMAGE_BINARY_UNAVAILABLE',409);
    const binary=new Uint8Array(await downloaded.data.arrayBuffer());
    if(!verifyWosSyntheticPngBinary(binary,x.sha256))return fail('IMAGE_BINARY_INVALID',422);
    return NextResponse.json({ok:true,code:'QA_IMAGE_VERIFIED',
      data:{sha256:x.sha256}},{status:200,headers:noCache});
  } catch {return fail('QA_IMAGE_VERIFY_UNAVAILABLE',503);}
}
