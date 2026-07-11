// ===== AI Job Store =====
// In-memory Map-based job store (local dev) + optional Supabase persistence
// Supports polling-based async script generation to avoid Vercel timeout limits.

export interface AIJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: any;
  output: any | null;
  error: string | null;
  provider: string;
  progress: number; // 0-1
  attempts: number;
  maxAttempts: number;
  jobType: string;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

type JobStatusCallback = (job: AIJob) => void;

// ===== In-Memory Store (always available) =====

class InMemoryJobStore {
  private jobs = new Map<string, AIJob>();
  private listeners = new Map<string, Set<JobStatusCallback>>();

  create(input: any, jobType: string, provider: string, maxAttempts = 2): AIJob {
    const id = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const job: AIJob = {
      id, status: 'queued', input, output: null, error: null,
      provider, progress: 0, attempts: 0, maxAttempts,
      jobType, createdAt: Date.now(), startedAt: null, completedAt: null,
    };
    this.jobs.set(id, job);
    return job;
  }

  get(id: string): AIJob | undefined {
    return this.jobs.get(id);
  }

  update(id: string, partial: Partial<AIJob>): AIJob | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    Object.assign(job, partial);
    this.jobs.set(id, job);
    // Notify listeners
    const callbacks = this.listeners.get(id);
    if (callbacks) callbacks.forEach(cb => cb(job));
    return job;
  }

  list(limit = 50, status?: string): AIJob[] {
    const all = Array.from(this.jobs.values());
    const filtered = status ? all.filter(j => j.status === status) : all;
    return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  onUpdate(id: string, callback: JobStatusCallback): () => void {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(callback);
    return () => this.listeners.get(id)?.delete(callback);
  }
}

export const jobStore = new InMemoryJobStore();

// ===== Supabase Persistence (production, best-effort) =====

export async function persistJobToSupabase(job: AIJob): Promise<void> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const sb = createClient(supabaseUrl, supabaseKey);
    const { error } = await sb.from('ai_jobs').upsert({
      id: job.id, status: job.status, input: JSON.stringify(job.input),
      output: job.output ? JSON.stringify(job.output) : null,
      error: job.error, provider: job.provider, progress: job.progress,
      attempts: job.attempts, job_type: job.jobType,
      created_at: new Date(job.createdAt).toISOString(),
      started_at: job.startedAt ? new Date(job.startedAt).toISOString() : null,
      completed_at: job.completedAt ? new Date(job.completedAt).toISOString() : null,
    }, { onConflict: 'id' });
    if (error) console.warn('[Jobs] Supabase persist error:', error.message);
  } catch {}
}

// ===== Job Processing =====

export function createJob(input: any, jobType: string, provider: string): AIJob {
  const job = jobStore.create(input, jobType, provider);
  persistJobToSupabase(job);
  return job;
}

export function getJob(id: string): AIJob | undefined {
  return jobStore.get(id);
}

export async function processJob(jobId: string): Promise<AIJob> {
  const job = jobStore.get(jobId);
  if (!job) throw new Error('Job not found: ' + jobId);
  
  jobStore.update(jobId, { status: 'running', startedAt: Date.now(), attempts: job.attempts + 1 });
  persistJobToSupabase(jobStore.get(jobId)!);

  try {
    const { runCanonicalPipeline } = await import('./script-pipeline');
    const result = await runCanonicalPipeline(job.input);
    jobStore.update(jobId, {
      status: 'completed', output: result, progress: 1,
      completedAt: Date.now(),
    });
    persistJobToSupabase(jobStore.get(jobId)!);
  } catch (err: any) {
    const updated = jobStore.update(jobId, {
      status: job.attempts < job.maxAttempts ? 'queued' : 'failed',
      error: err.message,
      completedAt: Date.now(),
    });
    if (updated) persistJobToSupabase(updated);
  }

  return jobStore.get(jobId)!;
}
