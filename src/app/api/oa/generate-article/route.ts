import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  article_type: z.enum(['知识解释类', '宣传信任类', '节日/节气类']),
  target_audience: z.string().optional(),
  knowledge_card_ids: z.array(z.string()).optional(),
  holiday_context: z.string().optional(),
  tone_style: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { article_type, knowledge_card_ids, holiday_context } = parsed.data;

  // Mock generation logic
  const titles: Record<string, string> = {
    '知识解释类': '热转印工艺科普：' + (knowledge_card_ids?.[0] ? '从选材到成品' : '材质判断与选择'),
    '宣传信任类': '宏达印业19年：为什么客户持续选择我们',
    '节日/节气类': holiday_context ? holiday_context + '｜热转印行业的温度哲学' : '节气科普｜热转印的温度控制',
  };

  const article = {
    title: titles[article_type] || '公众号文章',
    subtitle: '用知识库为您生成的内容',
    summary: '本文基于知识卡' + (knowledge_card_ids?.join('、') || '') + '生成，内容已通过风险检查。',
    chapter_outline: ['引言', '核心知识点1', '核心知识点2', '总结与CTA'],
    body_blocks: [
      { type: 'title', content: titles[article_type] },
      { type: 'paragraph', content: article_type === '节日/节气类' ? holiday_context + '到来之际，我们聊聊热转印行业的"温度"控制。' : '这是一篇由宏达知识库生成的专业内容。' },
      { type: 'paragraph', content: '本文引用了知识库中的专业判断，确保内容准确、可执行。' },
      { type: 'cta', content: '想了解您的产品适合哪种印刷工艺？添加客服微信，发产品图片免费评估。' },
    ],
    body_markdown: '# ' + titles[article_type] + '\n\n' + (article_type === '节日/节气类' ? holiday_context + '到来之际...' : '由知识库生成的专业内容。'),
    suggested_cover_text: titles[article_type].slice(0, 20),
    cta_text: '添加客服微信，发产品图片免费评估方案',
    risk_notes: ['不承诺具体价格', '工艺判断以实际打样为准', '内容引用自宏达知识库'],
    source_knowledge_card_ids: knowledge_card_ids || [],
    word_count: 350,
    estimated_read_time: 3,
  };

  return NextResponse.json(article);
}
