import { NextRequest } from 'next/server';
import { guardOaPrivilegedRequest, oaJson } from '@/lib/oa/oa-api-safety';
import { isOaSimulationAllowed } from '@/lib/oa/oa-access-policy';
export const dynamic = 'force-dynamic';
export async function POST(req:NextRequest) {
  const denied=await guardOaPrivilegedRequest(req);
  if(denied) return denied;
  if(!isOaSimulationAllowed(process.env.VERCEL_ENV,process.env.NODE_ENV))
    return oaJson({ok:false,code:'OA_SIMULATION_PREVIEW_ONLY',error:'正式环境禁止模拟发布'},403);
  // No fake public URL, invented metrics, in-memory queue or database writes.
  return oaJson({ok:true,mock:true,simulation:true,durable:false,status:'simulated_only',
    article_url:null,metrics:null,message:'仅完成 Preview 模拟，无真实公众号草稿或发布记录'});
}
