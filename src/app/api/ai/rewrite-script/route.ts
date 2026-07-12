import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/providers';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { script, hook, feedback } = body;
    if (!script) return NextResponse.json({ error: 'Missing script' }, { status: 400 });
    if (!feedback) return NextResponse.json({ error: 'Missing feedback' }, { status: 400 });

    const provider = await getProvider();
    const prompt = `请根据以下反馈意见重写这条短视频口播脚本。

原脚本：
${script}

反馈意见：
${feedback}

要求：
1. 保持核心信息和要表达的观点不变
2. 按反馈意见改进表达方式
3. 语言像工厂老板/业务员在说话，每句话不超过30字
4. 第一句话要用以下钩子开头：${hook || script.split('\n')[0] || ''}
5. 不要用"首先""其次""最后""很多客户问我这个问题""今天统一回答一下"

输出JSON格式：
{
  "script": "完整口播稿，每行一句",
  "hook": "开头钩子",
  "wordCount": 数字,
  "changes": ["改进了什么1", "改进了什么2"]
}`;

    const response = await provider.generateStructured({
      systemPrompt: '你是宏达印业的新媒体文案顾问。输出JSON，不要markdown包裹。',
      userPrompt: prompt, outputFormat: 'json', temperature: 0.7,
    });

    const parsed = response.parsed || {};
    return NextResponse.json({
      script: parsed.script || script,
      hook: parsed.hook || hook || '',
      wordCount: parsed.wordCount || 0,
      changes: (parsed.changes as string[]) || ['AI重写完成'],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
