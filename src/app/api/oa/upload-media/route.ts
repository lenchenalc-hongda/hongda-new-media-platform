import { NextRequest, NextResponse } from 'next/server';
import { uploadCover } from '@/lib/integrations/wechat/WechatPublisherAdapter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, title } = body;
    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }
    const result = await uploadCover(imageUrl, title);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
