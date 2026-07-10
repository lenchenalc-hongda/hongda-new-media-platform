// POST /api/ai/script/pipeline
// Calls DeepSeek directly with a single comprehensive prompt
// Falls back to rule engine if DeepSeek fails

import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/providers';
import { runPipeline, removeAiTone, compressScriptByDuration, scoreScript, checkScriptRisk, generateScriptStrategy, splitBroadTopic, retrieveKnowledgeForScript } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, topic, customerPain, productOrProcess, material, knowledgeCards, video_length } = body;

    // 1. Strategy (local rules)
    const isBroad = (topic||'').length > 12 || ['介绍','注意事项','说清楚','全部','常见问题'].some((k: string) => (topic||'').includes(k));
    const subTopics = isBroad ? splitBroadTopic(topic || '') : [];
    const strategy = generateScriptStrategy({ account, topic: subTopics[0] || topic || customerPain, customerPain, productOrProcess, material, knowledgeCards });

    // 2. Try DeepSeek directly with one comprehensive prompt
    let aiOutput: any = null;
    let aiError: string | null = null;
    try {
      const provider = await getProvider();
      const accountInfo = account ? `账号人设：${account.name || ''} ${account.persona || ''}` : '';
      const cardInfo = knowledgeCards?.length ? `参考知识：${knowledgeCards.slice(0, 3).map((k: any) => k.title + '：' + (k.core_conclusion || '').slice(0, 100)).join('|')}` : '';

      const prompt = `请为以下输入生成一条短视频口播脚本。

${accountInfo}
目标客户：${strategy.targetCustomer}
客户痛点：${customerPain || '无'}
产品/工艺：${productOrProcess || '无'}
材质：${material || '无'}
${cardInfo}

要求：
1. 开头前3秒用具体客户问题或冲突（如"PE瓶能不能做热转印？"）
2. 中间讲清楚一个核心判断逻辑，用客户场景支撑
3. 语言像工厂老板/业务员在说话，每句话不超过30字
4. 不要用"首先""其次""最后""很多客户问我这个问题""今天统一回答一下"
5. 结尾自然引导下一步

输出严格JSON格式（不要任何额外文字）：
{
  "hook": "开头钩子，不超过25字",
  "body": "完整口播稿，每行一句，总字数控制在60-150字之间",
  "wordCount": "中文字数"
}`;

      const response = await provider.generateStructured({
        systemPrompt: '你是宏达印业的新媒体顾问。输出JSON，不要markdown包裹。',
        userPrompt: prompt,
        outputFormat: 'json',
        temperature: 0.7,
      });

      if (response.parsed && response.parsed.body) {
        aiOutput = response.parsed;
      } else if (response.content) {
        // Try to extract JSON from content
        try {
          const extracted = JSON.parse(response.content);
          if (extracted.body) aiOutput = extracted;
        } catch {}
      }
      if (!aiOutput) aiError = 'DeepSeek returned incomplete response';
    } catch (e: any) {
      aiError = e.message;
    }

    // 3. Fall back to rule engine if DeepSeek failed
    if (!aiOutput) {
      console.warn('[Pipeline] DeepSeek failed:', aiError);
      const ruleResult = runPipeline({ account, topic: topic||customerPain, customerPain, productOrProcess, material, knowledgeCards, video_length });
      return NextResponse.json({ ...ruleResult, aiUsed: false, mock: true, aiError });
    }

    // 4. Apply local rules to AI output
    const durations: ('15' | '30' | '60')[] = ['15', '30', '60'];
    const variants: any[] = durations.map(d => {
      let script = removeAiTone(aiOutput.body || '');
      const { compressed } = compressScriptByDuration(script, d);
      script = compressed;
      const wordCount = (script.match(/[\u4e00-\u9fff]/g) || []).length;
      const score = scoreScript(script, d);
      return { duration: d, hook: aiOutput.hook, script, wordCount, estimatedSeconds: parseInt(d), score, subtitlePoints: [] };
    });

    const scored = [...variants].sort((a, b) => (b.score?.totalScore||0) - (a.score?.totalScore||0));
    const bestVariant = scored[0] || null;
    const bestScore = bestVariant?.score || null;
    let recommendedStatus = 'draft';
    if (bestScore) {
      if (bestScore.totalScore >= 85 && bestScore.riskLevel !== '高') recommendedStatus = 'pending_review';
      else if (bestScore.totalScore >= 70) recommendedStatus = 'draft';
      else if (bestScore.totalScore >= 60) recommendedStatus = 'needs_rewrite';
      else recommendedStatus = 'discard';
    }
    const risk = bestVariant ? { riskLevel: bestVariant.score?.riskLevel||'低', riskPoints: bestVariant.score?.riskPoints||[], allowSave: (bestVariant.score?.riskLevel||'低') !== '高' } : { riskLevel: '低' as const, riskPoints: [], allowSave: true };

    return NextResponse.json({
      strategy, isBroad, subTopics, variants, bestVariant, risk, recommendedStatus,
      angleCandidates: [], hookCandidates: [], selectedHook: aiOutput.hook || strategy.hook,
      sourceKnowledgeCards: retrieveKnowledgeForScript({ knowledgeCards, topic: customerPain, customerPain }),
      aiUsed: true, mock: false,
    });
  } catch (err: any) {
    console.error('[Pipeline] Error:', err.message);
    try {
      const result = runPipeline(await req.json());
      return NextResponse.json({ ...result, aiUsed: false, mock: true });
    } catch { return NextResponse.json({ error: err.message }, { status: 500 }); }
  }
}
