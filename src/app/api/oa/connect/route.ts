import { NextRequest, NextResponse } from 'next/server';
import { checkConnection, loadConfig } from '@/lib/integrations/wechat/WechatPublisherAdapter';

export async function GET() {
  const config = loadConfig();
  const status = await checkConnection();
  return NextResponse.json({
    configured: !!config,
    appId: config?.appId || null,
    ...status,
    env_keys_present: {
      WECHAT_APP_ID: !!process.env.WECHAT_APP_ID,
      WECHAT_APP_SECRET: !!process.env.WECHAT_APP_SECRET,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'check') {
    const status = await checkConnection();
    return NextResponse.json(status);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
