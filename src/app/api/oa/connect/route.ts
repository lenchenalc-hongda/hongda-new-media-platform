import { NextRequest, NextResponse } from 'next/server';
import { checkConnection, loadConfig } from '@/lib/integrations/wechat/WechatPublisherAdapter';

export async function GET() {
  const config = loadConfig();
  const status = await checkConnection();

  // Debug: check all env vars that start with WECHAT
  const allEnvVars: Record<string, boolean> = {};
  const envKeys = Object.keys(process.env).filter(k => k.startsWith('WECHAT') || k.startsWith('wechat'));
  envKeys.forEach(k => { allEnvVars[k] = true; });

  return NextResponse.json({
    configured: !!config,
    appId: config?.appId || null,
    accountName: config?.accountName || null,
    ...status,
    env_keys_present: {
      WECHAT_APP_ID: !!process.env.WECHAT_APP_ID,
      WECHAT_APP_SECRET: !!process.env.WECHAT_APP_SECRET,
    },
    all_wechat_env_vars: envKeys,
    env_count: envKeys.length,
    node_env: process.env.NODE_ENV,
    help: '如果 env_keys_present 为 false，说明环境变量在 Vercel 中未正确配置。请检查：
    1. 变量名是否完全等于 WECHAT_APP_ID（注意大小写）
    2. Environment 是否选择了 Production
    3. 添加后是否有新部署完成',
  });
}
