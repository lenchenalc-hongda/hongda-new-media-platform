// POST /api/ai/script/pipeline
// AI-powered pipeline: DeepSeek generates angles → hooks → draft
// Local rules ALWAYS applied: removeAiTone → compress → score → risk check

import { NextRequest, NextResponse } from 'next/server';
import {
  runPipeline, generateScriptStrategy, generateHook, splitBroadTopic,
  removeAiTone, compressScriptByDuration, scoreScript, checkScriptRisk,
  retrieveKnowledgeForScript, ScriptScoreResult,
} from '@/lib/ai/script-pipeline';
import { LLMAdapter } from '@/lib/ai/llm';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, topic, customerPain, productOrProcess, material, knowledgeCards, video_length } = body;

    if (!topic && !customerPain && !productOrProcess) {
      return NextResponse.json({ error: '需要至少提供 topic、customerPain 或 productOrProcess' }, { status: 400 });
    }

    // 1. Strategy (rule engine)
    const isBroad = (topic||'').length > 12 || ['介绍','注意事项','说清楚','全部','常见问题'].some((k: string) => (topic||'').includes(k));
    const subTopics = isBroad ? splitBroadTopic(topic || '') : [];
    const strategy = generateScriptStrategy({
      account, topic: subTopics[0] || topic || customerPain,
      customerPain, productOrProcess, material, knowledgeCards,
    });

    // 2. Try DeepSeek for draft
    let aiDraft: any = null;
    let selectedHook = strategy.hook;
    let angleCandidates: any[] = [];
    let hookCandidates: any[] = [];

    try {
      const llm = new LLMAdapter();
      angleCandidates = (await llm.generateAngles({ topic: strategy.topic, customerPain, productOrProcess, material })) || [];
      const bestAngle = angleCandidates.length > 0 ? angleCandidates[0].angle : strategy.topic;
      hookCandidates = (await llm.generateHooks({ topic: strategy.topic, angle: bestAngle, customerPain })) || [];
      if (hookCandidates.length > 0) {
        hookCandidates.sort((a: any, b: any) => (b.strength || 0) - (a.strength || 0));
        selectedHook = hookCandidates[0].hook;
      }
      aiDraft = await llm.generateDraft({ hook: selectedHook, angle: bestAngle, targetCustomer: strategy.targetCustomer, customerPain: customerPain || '', productOrProcess });
    } catch (e: any) {
      console.warn('[Pipeline-API] DeepSeek failed, falling back to rule engine:', e.message);
    }

    // 3. Build variants
    const durations: ('15' | '30' | '60')[] = ['15', '30', '60'];
    const variants: any[] = durations.map((d) => {
      let script = '';
      let hook = selectedHook;
      let wordCount = 0;
      let subtitles: string[] = [];
      const limit = d === '15' ? 120 : d === '30' ? 220 : 420;

      if (aiDraft && aiDraft.body) {
        script = aiDraft.body;
        hook = aiDraft.hook || selectedHook;
        wordCount = (script.match(/[\u4e00-\u9fff]/g) || []).length;
        subtitles = aiDraft.subtitlePoints || [];
      }

      // ALWAYS apply local rules
      script = removeAiTone(script);
      const { compressed } = compressScriptByDuration(script, d);
      script = compressed;
      wordCount = (script.match(/[\u4e00-\u9fff]/g) || []).length;

      // Always score locally
      const score = scoreScript(script, d);
      const risk = checkScriptRisk(script);

      return { duration: d, hook, script, wordCount, estimatedSeconds: parseInt(d), score, risk, subtitlePoints: subtitles, limit };
    });

    // 4. If AI failed, fall back to rule engine for all variants
    if (!aiDraft || !aiDraft.body) {
      const ruleResult = runPipeline({ account, topic: topic||customerPain, customerPain, productOrProcess, material, knowledgeCards, video_length });
      return NextResponse.json({
        ...ruleResult, angleCandidates, hookCandidates, selectedHook,
        sourceKnowledgeCards: retrieveKnowledgeForScript({ knowledgeCards, topic: customerPain, customerPain }),
        aiUsed: false, mock: true,
      });
    }

    // 5. Pick best variant & determine status
    const scored = [...variants].filter(v => v.score !== null).sort((a, b) => (b.score?.totalScore||0) - (a.score?.totalScore||0));
    const bestVariant = scored[0] || null;
    const bestScore = bestVariant?.score || null;
    let recommendedStatus = 'draft';
    if (bestScore) {
      if (bestScore.totalScore >= 85 && bestScore.riskLevel !== '高') recommendedStatus = 'pending_review';
      else if (bestScore.totalScore >= 70) recommendedStatus = 'draft';
      else if (bestScore.totalScore >= 60) recommendedStatus = 'needs_rewrite';
      else recommendedStatus = 'discard';
    }

    // 6. If AI draft scored < 80, try rewrite
    if (aiDraft && bestScore && bestScore.totalScore < 80) {
      try {
        const llm = new LLMAdapter();
        const rewrite = await llm.rewriteScript({ script: bestVariant?.script||'', feedback: '评分偏低，请更口语化、更短句、直接点出客户问题' });
        if (rewrite?.body) {
          const rewritten = removeAiTone(rewrite.body);
          const newScore = scoreScript(rewritten, bestVariant?.duration||'30');
          if (newScore.totalScore > (bestScore?.totalScore||0)) { bestVariant!.script = rewritten; bestVariant!.score = newScore; }
        }
      } catch {}
    }

    // 7. Return
    const risk = bestVariant ? { riskLevel: bestVariant.risk?.riskLevel||'低', riskPoints: bestVariant.risk?.riskPoints||[], allowSave: (bestVariant.risk?.riskLevel||'低') !== '高' } : { riskLevel: '低' as const, riskPoints: [], allowSave: true };

    return NextResponse.json({
      strategy, isBroad, subTopics, variants, bestVariant, risk, recommendedStatus,
      angleCandidates, hookCandidates, selectedHook,
      sourceKnowledgeCards: retrieveKnowledgeForScript({ knowledgeCards, topic: customerPain, customerPain }),
      aiUsed: true, mock: true,
    });
  } catch (err: any) {
    console.error('[Pipeline-API] Error:', err.message);
    // Final fallback: pure rule engine
    try {
      const body = await req.json();
      const result = runPipeline(body);
      return NextResponse.json({ ...result, aiUsed: false, mock: true });
    } catch {
      return NextResponse.json({ error: 'Pipeline failed', details: err.message }, { status: 500 });
    }
  }
}
