// POST /api/ai/script/pipeline
// Canonical entry point — ALL script generation goes through runCanonicalPipeline().
// Providers NEVER bypass local rules, scoring, or risk checks.

import { NextRequest, NextResponse } from 'next/server';
import { runCanonicalPipeline, CanonicalPipelineRequestSchema } from '@/lib/ai/script-pipeline';
import { createJob, processJob } from '@/lib/ai/jobs';
import { getCurrentProviderName } from '@/lib/ai/providers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode || 'sync';
    const provider = getCurrentProviderName();

    // DeepSeek defaults to async unless explicitly forced sync
    const effectiveMode = (mode === 'sync' && provider === 'deepseek' && body.forceSync !== true)
      ? 'async' : mode;

    // Parse input (validates schema)
    const parsed = CanonicalPipelineRequestSchema.parse(body);

    if (effectiveMode === 'async') {
      // Enqueue job and return 202 immediately
      const job = createJob(parsed, 'script_generation', provider);
      
      // Process job in background (fire-and-forget)
      // Using waitUntil-like pattern — Next.js will keep the function alive briefly
      processJob(job.id).catch(err => console.error('[Jobs] Background process error:', err));

      return NextResponse.json({
        ok: true, status: 'queued', jobId: job.id,
        pollingUrl: '/api/ai/script/jobs/' + job.id,
      }, { status: 202 });
    }

    // Sync mode: run directly
    const result = await runCanonicalPipeline(parsed);
    return NextResponse.json({
      ...result,
      aiUsed: !result.mock,
      endpoint: 'canonical',
      mode: 'sync',
      selectedAngle: result.selectedAngle || null,
      selectedHook: result.hookCandidates?.find((h: any) => h.id === parsed.selectedHookId)
        || (result.hookCandidates?.[0] || null),
    });
  } catch (err: any) {
    console.error('[Pipeline] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
