import { NextRequest } from 'next/server';
import { guardOaPrivilegedRequest, oaJson } from '@/lib/oa/oa-api-safety';
export const dynamic = 'force-dynamic';
// No live token request, env enumeration, proxy URL, IP lookup or WeChat error echo.
export async function GET(req:NextRequest) {
  const denied=await guardOaPrivilegedRequest(req);
  if(denied) return denied;
  return oaJson({
    configured:Boolean(process.env.WECHAT_APP_ID&&process.env.WECHAT_APP_SECRET),
    connectionVerified:false,wechatWriteEnabled:false,adapter:'disabled',
    note:'仅显示配置状态；真实微信连接与写入未获批准，不进行在线诊断',
  });
}
