import { NextRequest, NextResponse } from 'next/server';
import { publishDraft } from '@/lib/integrations/wechat/WechatPublisherAdapter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { draftId } = body;
    if (!draftId) {
      return NextResponse.json({ error: 'draftId is required' }, { status: 400 });
    }
    const result = await publishDraft(draftId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
