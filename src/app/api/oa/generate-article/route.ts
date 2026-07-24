import { NextRequest, NextResponse } from 'next/server';
import { runArticlePipeline } from '@/lib/oa/article-pipeline';
import { z } from 'zod';

const schema = z.object({
  sourceCardIds: z.array(z.string()).min(1, '至少选择一条内容来源卡'),
  articleType: z.enum([
    'technical_guide', 'faq_answer', 'machine_selection', 'process_sop',
    'case_study', 'troubleshooting', 'brand_story', 'sales_enablement', 'festival_soft',
  ]).optional(),
  targetAudience: z.string().optional(),
  usage: z.enum(['wechat_publish', 'sales_forward', 'website_article', 'internal_training', 'video_script_expand']).optional(),
  templateId: z.string().optional(),
  topic: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '输入不完整', details: parsed.error.flatten() }, { status: 400 });
    }

    const result = runArticlePipeline(parsed.data);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '文章生成失败' }, { status: 400 });
  }
}
