import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/providers';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, platform, productOrProcess, material } = body;
    const provider = await getProvider();

    const prompt = `请为热转印工厂推荐8-10个客户常见痛点。
账号人设：${account?.name || ''}（${account?.persona || ''}）
平台：${platform || '视频号'}
${productOrProcess ? '产品/工艺：' + productOrProcess : ''}
${material ? '材质：' + material : ''}

要求：
1. 每个痛点不超过15字
2. 说明为什么客户在意这个痛点
3. 这个痛点的转化目标是什么
4. 标注风险等级

输出JSON格式：{"suggestions": [{"pain":"...","whyItMatters":"...","conversionGoal":"...","riskLevel":"低|中|高"}]}`;

    const response = await provider.generateStructured({
      systemPrompt: '你是宏达印业的新媒体顾问。输出JSON。',
      userPrompt: prompt, outputFormat: 'json', temperature: 0.8,
    });
    const suggestions = ((response.parsed?.suggestions || []) as any[]).slice(0, 10);
    return NextResponse.json({ suggestions, total: suggestions.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
