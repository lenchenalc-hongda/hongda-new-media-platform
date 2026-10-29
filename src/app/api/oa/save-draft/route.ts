import { NextRequest } from 'next/server';
import { guardOaPrivilegedRequest, oaWechatWriteLocked } from '@/lib/oa/oa-api-safety';
export const dynamic = 'force-dynamic';
// The legacy adapter fetched a real token before returning a fictitious draft id.
export async function POST(req:NextRequest) {
  const denied=await guardOaPrivilegedRequest(req);
  if(denied) return denied;
  return oaWechatWriteLocked();
}
