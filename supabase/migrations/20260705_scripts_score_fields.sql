-- Add score fields to scripts table
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS score int;
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS score_detail jsonb;
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS strengths text[];
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS weaknesses text[];
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS rewrite_suggestions text[];
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS recommended_status text;
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS risk_level text;
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS risk_points text[];
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS safer_expressions text[];

COMMENT ON COLUMN scripts.score IS '总评分 0-100';
COMMENT ON COLUMN scripts.grade IS '等级 S/A/B/C/D/F';
COMMENT ON COLUMN scripts.score_detail IS '评分维度详情JSON';
COMMENT ON COLUMN scripts.strengths IS '优点列表';
COMMENT ON COLUMN scripts.weaknesses IS '缺点列表';
COMMENT ON COLUMN scripts.rewrite_suggestions IS '修改建议列表';
COMMENT ON COLUMN scripts.recommended_status IS '推荐状态: pending_review/draft/needs_rewrite/discard';
COMMENT ON COLUMN scripts.risk_level IS '风险等级: 低/中/高';
COMMENT ON COLUMN scripts.risk_points IS '风险点列表';
COMMENT ON COLUMN scripts.safer_expressions IS '更安全的表达建议';
