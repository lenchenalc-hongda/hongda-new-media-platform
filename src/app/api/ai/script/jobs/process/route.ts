// POST /api/ai/script/jobs/process
// Internal processing endpoint — processes a job synchronously
// Intended to be called by a queue worker or via waitUntil/after

import { NextRequest, NextResponse } from 'next/server';
import { getJob, processJob } from '@/lib/ai/jobs';

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });

    const job = getJob(jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (job.status !== 'queued') return NextResponse.json({ error: 'Job already processed', status: job.status }, { status: 409 });

    const result = await processJob(jobId);
    return NextResponse.json({
      jobId: result.id, status: result.status,
      completedAt: result.completedAt, error: result.error,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
