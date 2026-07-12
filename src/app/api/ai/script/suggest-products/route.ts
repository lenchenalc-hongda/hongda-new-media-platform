import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/providers';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, platform, knowledgeMode, material } = body;
    const provider = await getProvider();

    const prompt = `请为热转印工厂推荐5-8个短视频内容方向。
账号人设：${account?.name || ''}（${account?.persona || ''}）
平台：${platform || '视频号'}
${material ? '材质：' + material : ''}
${knowledgeMode !== 'none' ? '用户选择参考知识库' : '不参考知识库'}

要求：
1. 每个方向标题不超过20字
2. 说明为什么这个方向适合该账号
3. 标注内容类型（产品/工艺/答疑/案例/科普）
4. 标注风险等级

输出JSON格式：{"suggestions": [{"title":"...","reason":"...","contentType":"product|process|qa|case|knowledge","riskLevel":"低|中|高"}]}`;

    const response = await provider.generateStructured({
      systemPrompt: '你是宏达印业的新媒体顾问。输出JSON。',
      userPrompt: prompt, outputFormat: 'json', temperature: 0.8,
    });
    const suggestions = ((response.parsed?.suggestions || []) as any[]).slice(0, 8);
    return NextResponse.json({ suggestions, total: suggestions.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
