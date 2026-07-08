-- 应用数据存储表：所有脚本、选题等跨设备协同数据
-- 替代 Vercel 上失效的文件存储

CREATE TABLE IF NOT EXISTS site_data (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 允许通过 anon key 读写 site_data
ALTER TABLE site_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "允许所有用户读取 site_data"
  ON site_data FOR SELECT
  USING (true);

CREATE POLICY "允许所有用户写入 site_data"
  ON site_data FOR INSERT
  WITH CHECK (true);

CREATE POLICY "允许所有用户更新 site_data"
  ON site_data FOR UPDATE
  USING (true);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_site_data_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_site_data_timestamp
  BEFORE UPDATE ON site_data
  FOR EACH ROW
  EXECUTE FUNCTION update_site_data_timestamp();
