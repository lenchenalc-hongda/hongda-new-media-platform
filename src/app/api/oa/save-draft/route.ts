import { NextRequest, NextResponse } from 'next/server';
import { saveDraft } from '@/lib/integrations/wechat/WechatPublisherAdapter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { articleId, title, content, digest, coverMediaId } = body;
    if (!title || !content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
    }
    const result = await saveDraft({ title, content, digest, coverMediaId });
    return NextResponse.json({ ...result, articleId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
