import { NextRequest, NextResponse } from 'next/server';
import { renderOAArticleHtml } from '@/lib/oa/article-pipeline';
import { getArticleTemplateById } from '@/lib/oa/article-templates';
import { z } from 'zod';

const schema = z.object({
  draft: z.any(),
  templateId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误', details: parsed.error.flatten() }, { status: 400 });
    }

    const { draft, templateId } = parsed.data;
    const template = getArticleTemplateById(templateId);
    if (!template) {
      return NextResponse.json({ error: '模板不存在: ' + templateId }, { status: 404 });
    }

    const html = renderOAArticleHtml(draft, template);
    const markdown = draft.bodyMarkdown || '';
    const signature = '\n\n---\n*本文由宏达新媒体作战中台生成 · 参考自知识库*\n*当前为草稿/复制模式，尚未接入真实微信公众号发布。*';

    return NextResponse.json({
      html,
      markdown: markdown + signature,
      templateName: template.name,
      blocksCount: draft.bodyBlocks?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '渲染失败' }, { status: 500 });
  }
}
