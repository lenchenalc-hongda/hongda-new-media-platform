-- site_data 表：应用数据跨设备同步
-- 替代 Vercel 上失效的文件存储
-- 用 service_role key + GRANT + RLS 确保所有角色可读写

DROP TABLE IF EXISTS site_data;

CREATE TABLE site_data (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 显式授权给所有角色
GRANT ALL ON TABLE site_data TO service_role;
GRANT ALL ON TABLE site_data TO anon;
GRANT ALL ON TABLE site_data TO authenticated;

-- 开启行级安全
ALTER TABLE site_data ENABLE ROW LEVEL SECURITY;

-- RLS 策略：所有用户可读写
CREATE POLICY "anyone_select" ON site_data FOR SELECT USING (true);
CREATE POLICY "anyone_insert" ON site_data FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone_update" ON site_data FOR UPDATE USING (true);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_site_data_timestamp()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_site_data_timestamp ON site_data;
CREATE TRIGGER set_site_data_timestamp
  BEFORE UPDATE ON site_data
  FOR EACH ROW EXECUTE FUNCTION update_site_data_timestamp();
