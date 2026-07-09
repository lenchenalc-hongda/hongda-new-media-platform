// POST /api/oa/publish
// Publish an article through the adapter layer

import { NextRequest, NextResponse } from 'next/server';
import { createPublishJob, executePublishJob, checkPublishGate, getPublishLogs, getAllPublishJobs, retryPublishJob } from '@/lib/oa/publish-queue';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, articleId, title, bodyHtml, bodyMarkdown, summary, jobId, score, riskLevel } = body;

    switch (action) {
      case 'publish': {
        // Check publish gate
        const gate = checkPublishGate({ publishStatus: 'approved', score, riskLevel });
        if (!gate.canPublish) {
          return NextResponse.json({ success: false, error: '审核闸门未通过', reasons: gate.reasons }, { status: 400 });
        }
        const job = await createPublishJob(articleId, title, { articleId, title, bodyHtml: bodyHtml || '', bodyMarkdown: bodyMarkdown || '', summary: summary || '' });
        const result = await executePublishJob(job.id);
        return NextResponse.json({ success: result.status === 'published', job: result });
      }
      case 'save_draft': {
        const job = await createPublishJob(articleId, title, { articleId, title, bodyHtml: bodyHtml || '', bodyMarkdown: bodyMarkdown || '', summary: summary || '' });
        job.status = 'draft_saved';
        return NextResponse.json({ success: true, job, message: '草稿已保存（Mock）' });
      }
      case 'retry': {
        if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        const job = await retryPublishJob(jobId);
        return NextResponse.json({ success: job.status === 'published', job });
      }
      case 'status': {
        if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        const allJobs = getAllPublishJobs();
        const job = allJobs.find(j => j.id === jobId);
        return NextResponse.json({ job });
      }
      case 'logs': {
        const logs = getPublishLogs(body.limit || 50);
        return NextResponse.json({ logs, total: logs.length });
      }
      case 'list_jobs': {
        const jobs = getAllPublishJobs();
        return NextResponse.json({ jobs, total: jobs.length });
      }
      default:
        return NextResponse.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
