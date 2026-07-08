import { NextRequest, NextResponse } from 'next/server';
import { checkConnection, loadConfig } from '@/lib/integrations/wechat/WechatPublisherAdapter';

// Extract the outbound IP from the WeChat API error or detect it
async function detectCurrentIp(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    return data.ip || null;
  } catch {
    return null;
  }
}

// Parse the IP address from WeChat's error message
function parseIpFromError(error: string): string | null {
  const match = error.match(/invalid ip (\d+\.\d+\.\d+\.\d+)/i);
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  const config = loadConfig();
  const status = await checkConnection();
  const currentIp = await detectCurrentIp();

  // Debug: check all env vars that start with WECHAT
  const allEnvVars: Record<string, boolean> = {};
  const envKeys = Object.keys(process.env).filter(k => k.startsWith('WECHAT') || k.startsWith('wechat'));
  envKeys.forEach(k => { allEnvVars[k] = true; });

  // Try to parse the outbound IP from the error if connection failed
  const detectedFromWechat = !status.connected && status.error ? parseIpFromError(status.error) : null;

  const response = NextResponse.json({
    configured: !!config,
    appId: config?.appId || null,
    accountName: config?.accountName || null,
    ...status,
    current_deployment_ip: currentIp,
    ip_seen_by_wechat: detectedFromWechat,
    ip_whitelist_action: detectedFromWechat
      ? `请把 ${detectedFromWechat} 添加到微信IP白名单（只加单个IP，不要加44.226.0.0/16这样的范围）`
      : null,
    env_keys_present: {
      WECHAT_APP_ID: !!process.env.WECHAT_APP_ID,
      WECHAT_APP_SECRET: !!process.env.WECHAT_APP_SECRET,
    },
    all_wechat_env_vars: envKeys,
    env_count: envKeys.length,
    node_env: process.env.NODE_ENV,
    check_time: new Date().toISOString(),
  });
  
  // Prevent caching so each request re-checks with WeChat API
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  
  return response;
}
