import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/providers';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { script, weaknesses, rewriteSuggestions, totalScore, duration: bodyDuration, hook, account, knowledgeCards } = body;
    if (!script) return NextResponse.json({ error: 'Missing script' }, { status: 400 });

    const provider = await getProvider();

    // Build persona context
    const accountName = account?.name?.split('-')[0] || '';
    const persona = account?.persona || '';
    const dos = account?.dos || '';
    const donts = account?.donts || '';

    // Build knowledge context
    let kcContext = '';
    if (knowledgeCards && Array.isArray(knowledgeCards) && knowledgeCards.length > 0) {
      kcContext = '\n## 参考知识\n' + knowledgeCards.slice(0, 3).map((k: any) =>
        '- ' + (k.title || '') + '：' + (k.core_conclusion || k.content || '').slice(0, 100)
      ).join('\n');
    }

    const prompt = `你是一个短视频脚本优化专家。请根据评分分析优化以下脚本。

## 原脚本
${script}

## 评分分析
总分：${totalScore || '?'}/100
${weaknesses?.length ? '弱点：\n' + weaknesses.map((w: string) => '- ' + w).join('\n') : ''}
${rewriteSuggestions?.length ? '\n修改建议：\n' + rewriteSuggestions.map((s: string) => '- ' + s).join('\n') : ''}

## 账号人设
账号：${accountName}
人设定位：${persona}
${dos ? '✅ 应该做的：' + dos : ''}
${donts ? '❌ 不应该做的：' + donts : ''}
${kcContext}

## ⚠️ 关键约束（必须遵守）
1. 严格基于原文内容优化，不要添加原文未提及的材质名（如PE、PP、ABS、玻璃等）或工艺细节
2. 如果原文不涉及特定材质，优化后也不能出现任何材质名称
3. 第一句话保持以下钩子不变：${hook || script.split('\n')[0] || ''}
4. 保持核心观点和信息不变
5. 优化后字数控制在${bodyDuration === '15' ? '80-120' : bodyDuration === '30' ? '150-220' : '280-420'}字
6. 语言要按照人设来：${persona || '工厂老板/业务员'}的口吻说话
7. 优化后要保留针对弱点的具体改进

输出JSON格式：
{
  "optimizedScript": "优化后的完整脚本，每行一句，不要添加原文没有的材质名",
  "changes": ["具体改进了什么1", "具体改进了什么2"],
  "targetedFixes": ["对应弱点1已修复", "对应弱点2已修复"]
}`;

    const response = await provider.generateStructured({
      systemPrompt: '你是宏达印业的新媒体文案优化专家。优化时严格基于原文，不添加原文不存在的材质名和工艺名。输出JSON。',
      userPrompt: prompt, outputFormat: 'json', temperature: 0.7,
    });

    const parsed = response.parsed || {};
    const optimizedScript = parsed.optimizedScript || '';

    // AI评分优化后的脚本（直接调用 provider）
    let aiScore = {};
    if (optimizedScript) {
      const judgePrompt = `请对以下短视频脚本进行评分。

脚本内容：
${optimizedScript}
目标时长：${bodyDuration || '30'}秒

评分维度（每项满分25分，共100分）：
1. 开头钩子（hookScore）：开头是否直接点出客户具体问题或冲突
2. 口语化程度（spokenScore）：是否像真人在说话，不是文章
3. 客户痛点清晰度（painScore）：是否明确点出客户的具体问题
4. 转化引导（ctaScore）：结尾是否有自然引导下一步

输出JSON格式：
{
  "hookScore": 0-25,
  "spokenScore": 0-25,
  "painScore": 0-25,
  "ctaScore": 0-25,
  "totalScore": 总分,
  "grade": "S/A/B/C/D",
  "weaknesses": ["弱点1", "弱点2"],
  "strengths": ["优点1", "优点2"],
  "riskLevel": "低/中/高",
  "rewriteSuggestions": ["建议1", "建议2"]
}`;
      try {
        const r = await provider.generateStructured({
          systemPrompt: '你是短视频脚本评分专家。评分严格公正。输出JSON。',
          userPrompt: judgePrompt, outputFormat: 'json', temperature: 0.3,
        });
        aiScore = r.parsed || {};
      } catch {}
    }

    return NextResponse.json({
      optimizedScript,
      changes: (parsed.changes as string[]) || [],
      targetedFixes: (parsed.targetedFixes as string[]) || [],
      before: script,
      after: optimizedScript || script,
      aiScore, // AI评分的完整结果
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

