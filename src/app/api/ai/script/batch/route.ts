// POST /api/ai/script/batch
// Batch script generation using pipeline

import { NextRequest, NextResponse } from 'next/server';
import { batchGenerateShortScripts, runPipeline, retrieveKnowledgeForScript } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { count, account, knowledgeCards, video_length, pipelineConfig } = body;

    if (body.usePipeline) {
      // Generate each batch item through the full pipeline
      const results = [];
      const angles = ['报价前收资', '材质判断', '测试要求', '颜色判断', '打样判断', '小批量决策', '客户避坑', '工艺科普', '老板经验', '评论区答疑'];
      for (let i = 0; i < Math.min(count || 5, angles.length); i++) {
        const result = await runPipeline({
          account,
          customerPain: angles[i],
          knowledgeCards,
          video_length: video_length || '30',
          pipelineConfig: { useAI: true, ...pipelineConfig },
        });
        results.push({
          id: 'batch_' + Date.now() + '_' + i,
          title: `${angles[i]}：${result.strategy.topic}`,
          hook: result.selectedHook || result.strategy.hook,
          duration: video_length || '30',
          wordCount: result.bestVariant?.wordCount || 0,
          score: result.bestVariant?.score?.totalScore || 0,
          grade: result.bestVariant?.score?.grade || 'C',
          riskLevel: result.risk.riskLevel,
          recommendedStatus: result.recommendedStatus,
          selected: (result.bestVariant?.score?.totalScore || 0) >= 70,
        });
      }
      return NextResponse.json({ scripts: results, total: results.length, aiUsed: true });
    }

    // Legacy batch generation
    const results = batchGenerateShortScripts(body);
    return NextResponse.json({ scripts: results, total: results.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
