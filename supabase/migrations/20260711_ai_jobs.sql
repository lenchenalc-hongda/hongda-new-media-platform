-- ai_jobs 表：异步 AI 任务队列
-- 用于 DeepSeek 密集型脚本生成的异步执行
-- 避免 Vercel Serverless 10s 超时限制

CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  job_type TEXT NOT NULL DEFAULT 'script_generation',
  provider TEXT NOT NULL DEFAULT 'mock',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  progress REAL NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

GRANT ALL ON TABLE ai_jobs TO service_role;
GRANT ALL ON TABLE ai_jobs TO anon;
GRANT ALL ON TABLE ai_jobs TO authenticated;

ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_select_ai_jobs" ON ai_jobs FOR SELECT USING (true);
CREATE POLICY "anyone_insert_ai_jobs" ON ai_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone_update_ai_jobs" ON ai_jobs FOR UPDATE USING (true);
