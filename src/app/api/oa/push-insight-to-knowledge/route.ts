import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { insightType, content } = body;

  const cards: Record<string, any> = {
    title_pattern: {
      title: '高表现标题结构：' + (content?.title || '未知'),
      category: '脚本模板',
      cardType: '脚本模板知识卡',
      coreConclusion: content?.pattern || '标题包含具体问题+产品关键词的结构表现最好',
      summary: '从公众号数据复盘沉淀的标题模式',
      contentScope: '可对外',
    },
    column_strategy: {
      title: '高表现栏目：' + (content?.column || '工艺百科'),
      category: '复盘沉淀',
      cardType: '复盘沉淀知识卡',
      coreConclusion: content?.insight || '工艺百科类栏目阅读量和转化率最高',
      summary: '从公众号月报分析的栏目表现建议',
      contentScope: '可对外',
    },
    template_pref: {
      title: '推荐文章模板偏好',
      category: '脚本模板',
      cardType: '脚本模板知识卡',
      coreConclusion: '标准知识卡模板在"知识解释类"文章中表现最好',
      summary: '从公众号数据分析得出的模板偏好',
      contentScope: '可对外',
    },
  };

  const card = cards[insightType] || {
    title: '公众号分析沉淀',
    category: '复盘沉淀',
    cardType: '复盘沉淀知识卡',
    coreConclusion: JSON.stringify(content),
    summary: '从公众号分析结果自动沉淀的知识卡',
    contentScope: '可对外',
  };

  return NextResponse.json({
    success: true,
    card,
    message: `✅ 见解已沉淀为知识卡：「${card.title}」`,
    note: 'Mock 模式：知识卡仅返回预览，未实际写入数据库。配置真实环境后自动写入。',
  });
}
