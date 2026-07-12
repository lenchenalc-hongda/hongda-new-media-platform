import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/providers';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { script, hook } = body;
    if (!script) return NextResponse.json({ error: 'Missing script' }, { status: 400 });

    const provider = await getProvider();
    const prompt = `请根据以下脚本生成3个不同语气风格的同内容变体。

## 原脚本
${script}
${hook ? '\n钩子：' + hook : ''}

## 3种语气风格
1. 更口语 - 更像日常聊天，用词简单，句子更短
2. 更专业 - 更像老师傅讲解，增加行业术语
3. 更短 - 保留核心信息，删除多余内容

## 要求
1. 每个变体保持核心信息不变
2. 第一句话都用以下钩子开头：${hook || script.split('\n')[0] || ''}
3. 每句话不超过30字
4. 结尾自然引导下一步动作

输出JSON格式：
{
  "variants": [
    { "tone": "更口语", "script": "完整脚本每行一句", "hook": "开头钩子", "wordCount": 数字 },
    { "tone": "更专业", "script": "..." },
    { "tone": "更短", "script": "..." }
  ]
}`;

    const response = await provider.generateStructured({
      systemPrompt: '你是宏达印业的新媒体文案。输出JSON。',
      userPrompt: prompt, outputFormat: 'json', temperature: 0.8,
    });
    const variants = (response.parsed?.variants || []) as any[];
    return NextResponse.json({ variants, total: variants.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
