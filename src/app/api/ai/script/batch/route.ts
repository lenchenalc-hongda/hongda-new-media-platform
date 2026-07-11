// POST /api/ai/script/batch
// Batch script generation — each item goes through runCanonicalPipeline().

import { NextRequest, NextResponse } from 'next/server';
import { runCanonicalPipeline } from '@/lib/ai/script-pipeline';
import { createJob, processJob } from '@/lib/ai/jobs';
import { getCurrentProviderName } from '@/lib/ai/providers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode || 'sync';
    const provider = getCurrentProviderName();

    if (mode === 'async') {
      // Create a single batch job that will generate all scripts
      const job = createJob(body, 'batch_generation', provider);
      processJob(job.id).catch(err => console.error('[Batch] Background error:', err));
      return NextResponse.json({
        ok: true, status: 'queued', jobId: job.id,
        pollingUrl: '/api/ai/script/jobs/' + job.id,
      }, { status: 202 });
    }

    // Sync batch generation
    const { count, account, knowledgeCards, video_length } = body;
    const angles = ['报价前收资','材质判断','测试要求','颜色判断','打样判断','小批量决策','客户避坑','工艺科普','老板经验','评论区答疑'];

    const results = [];
    for (let i = 0; i < Math.min(count || 5, angles.length); i++) {
      const result = await runCanonicalPipeline({
        account, customerPain: angles[i],
        knowledgeCards, durationSeconds: video_length || '30',
      });
      const bs = result.bestVariant?.score;
      results.push({
        id: 'batch_' + Date.now() + '_' + i,
        title: angles[i] + '：' + result.strategy.topic,
        hook: result.selectedHook || result.strategy.hook,
        duration: video_length || '30',
        wordCount: result.bestVariant?.wordCount || 0,
        score: bs?.totalScore || 0,
        grade: bs?.grade || 'C',
        riskLevel: result.risk.riskLevel,
        recommendedStatus: result.recommendedStatus,
        selected: (bs?.totalScore || 0) >= 70,
      });
    }
    return NextResponse.json({ scripts: results, total: results.length, aiUsed: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
