// GET /api/ai/script/jobs/[jobId]
// Polling endpoint for async script generation job status

import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/ai/jobs';

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const job = getJob(params.jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      output: job.output,
      error: job.error,
      provider: job.provider,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
