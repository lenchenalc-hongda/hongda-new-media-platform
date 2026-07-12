import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/providers';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, platform, productOrProcess, customerPain, material } = body;
    const provider = await getProvider();

    const prompt = `请为以下场景推荐3-5条热转印工厂的知识点。

账号人设：${account?.name || ''}（${account?.persona || ''}）
平台：${platform || '视频号'}
${productOrProcess ? '产品/工艺：' + productOrProcess : ''}
${customerPain ? '客户痛点：' + customerPain : ''}
${material ? '材质：' + material : ''}

要求：
1. 每个知识点标题不超过20字
2. 说明这个知识点的核心结论
3. 说明是否可对外公开
4. 标注适用于什么内容类型

输出JSON格式：{"cards": [{"title":"...","coreConclusion":"...","contentScope":"public|internal","applicableTypes":"脚本/文章/答疑"}]}`;

    const response = await provider.generateStructured({
      systemPrompt: '你是宏达印业的知识库管理员。输出JSON。',
      userPrompt: prompt, outputFormat: 'json', temperature: 0.7,
    });
    const cards = ((response.parsed?.cards || []) as any[]).slice(0, 5);
    return NextResponse.json({ cards, total: cards.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
