import { NextRequest, NextResponse } from 'next/server';
import { queryPublishStatus } from '@/lib/integrations/wechat/WechatPublisherAdapter';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await queryPublishStatus(params.id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
