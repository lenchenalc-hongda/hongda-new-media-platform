-- scripts_similarity_memory: 用于防止重复生成相似内容
-- 支持相似度检查、账号记忆、脚本历史追踪

ALTER TABLE IF EXISTS scripts ADD COLUMN IF NOT EXISTS similarity_score REAL DEFAULT 0;
ALTER TABLE IF EXISTS scripts ADD COLUMN IF NOT EXISTS similarity_risk TEXT DEFAULT 'low';
ALTER TABLE IF EXISTS scripts ADD COLUMN IF NOT EXISTS account_memory_snapshot JSONB;

CREATE TABLE IF NOT EXISTS account_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('effective_hook', 'weak_phrase', 'recent_topic')),
  content TEXT NOT NULL,
  source_script_id TEXT,
  score REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_memories_account ON account_memories(account_id);
CREATE INDEX IF NOT EXISTS idx_account_memories_type ON account_memories(memory_type);

GRANT ALL ON TABLE account_memories TO service_role;
GRANT ALL ON TABLE account_memories TO anon;
GRANT ALL ON TABLE account_memories TO authenticated;

ALTER TABLE account_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_select_account_memories" ON account_memories FOR SELECT USING (true);
CREATE POLICY "anyone_insert_account_memories" ON account_memories FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone_update_account_memories" ON account_memories FOR UPDATE USING (true);
