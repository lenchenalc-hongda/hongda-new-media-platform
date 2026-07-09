// ===== 发布队列管理 =====
// 支持审核闸门：只有 approved + score >= 阈值 + risk != high 才能进入发布队列

import { getPublishAdapter, PublishResult, PublishRequest } from './publish-adapter';

export interface PublishJob {
  id: string;
  articleId: string;
  title: string;
  channel: 'wechat_mp';
  payload: Record<string, unknown>;
  status: 'pending' | 'draft_saved' | 'publishing' | 'published' | 'failed' | 'retrying';
  scheduledAt?: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  externalId?: string;
  externalStatus?: string;
  articleUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublishLog {
  id: string;
  jobId: string;
  articleId: string;
  title: string;
  action: 'save_draft' | 'publish' | 'retry' | 'status_check';
  result: PublishResult;
  timestamp: string;
}

// ===== 审核闸门规则 =====

export interface PublishGateCheck {
  canPublish: boolean;
  reasons: string[];
}

export function checkPublishGate(article: {
  publishStatus: string;
  score?: number;
  riskLevel?: string;
}): PublishGateCheck {
  const reasons: string[] = [];
  if (article.publishStatus !== 'approved') reasons.push('文章状态不是 已审核（需为 approved）');
  if (typeof article.score === 'number' && article.score < 60) reasons.push(`评分 ${article.score} 低于 60 分阈值`);
  if (article.riskLevel === '高') reasons.push('文章风险等级为 高，不允许发布');
  return { canPublish: reasons.length === 0, reasons };
}

// ===== 队列管理（内存实现，后续可加持久化）=====

const jobs: Map<string, PublishJob> = new Map();
const logs: PublishLog[] = [];

let jobCounter = 0;

function now(): string {
  return new Date().toISOString();
}

export async function createPublishJob(articleId: string, title: string, request: PublishRequest): Promise<PublishJob> {
  jobCounter++;
  const job: PublishJob = {
    id: 'job_' + Date.now() + '_' + jobCounter,
    articleId, title,
    channel: 'wechat_mp',
    payload: request as unknown as Record<string, unknown>,
    status: 'pending',
    scheduledAt: request.scheduledAt,
    attempts: 0,
    maxAttempts: 3,
    createdAt: now(),
    updatedAt: now(),
  };
  jobs.set(job.id, job);
  return job;
}

export async function executePublishJob(jobId: string): Promise<PublishJob> {
  const job = jobs.get(jobId);
  if (!job) throw new Error('Job not found: ' + jobId);

  job.status = 'publishing';
  job.attempts++;
  job.updatedAt = now();

  try {
    const adapter = getPublishAdapter();
    const request: PublishRequest = {
      articleId: job.articleId,
      title: job.title,
      bodyHtml: (job.payload.bodyHtml as string) || '',
      bodyMarkdown: (job.payload.bodyMarkdown as string) || '',
      summary: (job.payload.summary as string) || '',
    };

    const result = await adapter.publish(request);

    if (result.success) {
      job.status = 'published';
      job.externalId = result.externalId;
      job.externalStatus = result.externalStatus;
      job.articleUrl = result.articleUrl;
      job.lastError = undefined;

      logs.push({
        id: 'log_' + Date.now(),
        jobId, articleId: job.articleId,
        title: job.title,
        action: 'publish',
        result, timestamp: now(),
      });
    } else {
      job.status = 'failed';
      job.lastError = result.error;
      logs.push({
        id: 'log_' + Date.now(),
        jobId, articleId: job.articleId,
        title: job.title,
        action: 'publish',
        result, timestamp: now(),
      });
    }
  } catch (err: any) {
    job.status = job.attempts >= job.maxAttempts ? 'failed' : 'retrying';
    job.lastError = err.message;
    logs.push({
      id: 'log_' + Date.now(),
      jobId, articleId: job.articleId,
      title: job.title,
      action: 'publish',
      result: { success: false, error: err.message },
      timestamp: now(),
    });
  }

  job.updatedAt = now();
  return job;
}

export async function retryPublishJob(jobId: string): Promise<PublishJob> {
  const job = jobs.get(jobId);
  if (!job) throw new Error('Job not found: ' + jobId);
  if (job.attempts >= job.maxAttempts) {
    throw new Error('Max retry attempts reached for job: ' + jobId);
  }
  return executePublishJob(jobId);
}

export function getAllPublishJobs(): PublishJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPublishLogs(limit: number = 50): PublishLog[] {
  return logs.slice(-limit).reverse();
}

export function getPublishJobsByArticle(articleId: string): PublishJob[] {
  return getAllPublishJobs().filter(j => j.articleId === articleId);
}
