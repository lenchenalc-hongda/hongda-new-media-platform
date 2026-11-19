import { NextRequest } from 'next/server';
import { guardOaPrivilegedRequest, oaWechatWriteLocked } from '@/lib/oa/oa-api-safety';
export const dynamic = 'force-dynamic';
export async function POST(req:NextRequest) {
  const denied=await guardOaPrivilegedRequest(req);
  if(denied) return denied;
  return oaWechatWriteLocked();
}
