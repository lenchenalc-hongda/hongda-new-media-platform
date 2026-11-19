import { NextRequest } from 'next/server';
import { guardOaPrivilegedRequest, oaWechatWriteLocked } from '@/lib/oa/oa-api-safety';
export const dynamic = 'force-dynamic';
// There are no persisted WeChat publication ids in OA V1.
export async function GET(req:NextRequest,_ctx:{params:{id:string}}) {
  const denied=await guardOaPrivilegedRequest(req);
  if(denied) return denied;
  return oaWechatWriteLocked();
}
