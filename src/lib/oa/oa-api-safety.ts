import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth/current-user';
import { getAuthMode } from '@/lib/auth/types';
import { evaluateOaPrivilegedAccess } from './oa-access-policy';

export const oaJson = (data:unknown,status=200) => NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function guardOaPrivilegedRequest(req:NextRequest):Promise<NextResponse|null> {
  try {
    const authMode=getAuthMode();
    const actor=authMode==='supabase'?await getCurrentUserFromRequest(req):null;
    const decision=evaluateOaPrivilegedAccess(authMode,actor);
    if(!decision.allowed) return oaJson({ok:false,code:decision.code,error:'公众号管理权限不足或未登录'},decision.status);
    const origin=req.headers.get('origin');
    if(req.method!=='GET'&&origin&&origin!==req.nextUrl.origin)
      return oaJson({ok:false,code:'OA_ORIGIN_REJECTED',error:'请求来源不可信'},403);
    return null;
  } catch {
    return oaJson({ok:false,code:'OA_AUTH_UNAVAILABLE',error:'暂时无法验证公众号管理员身份'},503);
  }
}
// Never add an environment-variable bypass: durable audit + owner's human gate are required first.
export function oaWechatWriteLocked() {
  return oaJson({ok:false,mock:false,code:'OA_WECHAT_WRITE_DISABLED',error:'真实公众号草稿箱写入及发布尚未获批，未执行微信操作'},423);
}
