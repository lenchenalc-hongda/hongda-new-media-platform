import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/providers';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { script, weaknesses, rewriteSuggestions, totalScore, duration, hook } = body;
    if (!script) return NextResponse.json({ error: 'Missing script' }, { status: 400 });

    const provider = await getProvider();

    const prompt = `你是一个短视频脚本优化专家。请根据评分分析优化以下脚本。

## 原脚本
${script}

## 评分分析
总分：${totalScore || '?'}/100
${weaknesses?.length ? '弱点：\n' + weaknesses.map((w: string) => '- ' + w).join('\n') : ''}
${rewriteSuggestions?.length ? '\n修改建议：\n' + rewriteSuggestions.map((s: string) => '- ' + s).join('\n') : ''}

## 优化要求
1. 针对评分弱点进行定向优化
2. 第一句话保持以下钩子不变：${hook || script.split('\n')[0] || ''}
3. 保持核心观点和信息不变
4. 优化后字数控制在${duration === '15' ? '80-120' : duration === '30' ? '150-220' : '280-420'}字
5. 语言像工厂老板/业务员在说话
6. 优化后要保留针对弱点的具体改进

输出JSON格式：
{
  "optimizedScript": "优化后的完整脚本，每行一句",
  "changes": ["具体改进了什么1", "具体改进了什么2"],
  "targetedFixes": ["对应弱点1已修复", "对应弱点2已修复"]
}`;

    const response = await provider.generateStructured({
      systemPrompt: '你是宏达印业的新媒体文案优化专家。输出JSON，不要markdown包裹。',
      userPrompt: prompt, outputFormat: 'json', temperature: 0.7,
    });

    const parsed = response.parsed || {};
    return NextResponse.json({
      optimizedScript: parsed.optimizedScript || '',
      changes: (parsed.changes as string[]) || [],
      targetedFixes: (parsed.targetedFixes as string[]) || [],
      before: script,
      after: parsed.optimizedScript || script,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
