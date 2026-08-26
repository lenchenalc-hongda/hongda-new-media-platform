-- 宏达项目复盘与改善中心 - Phase 2R.4A
-- Review Metadata Foundation
-- Scope: review_dict_items unique(id, dict_type), system taxonomy seed,
--        review_metadata, review_metadata_items, RLS, metadata mutation RPC,
--        review_submit metadata gate, audit entity REVIEW_METADATA.
-- Safety: no Case tables, no Case API, no backfill, no legacy writes.

BEGIN;

-- ============ 1. review_dict_items FK support ============
ALTER TABLE public.review_dict_items
  ADD CONSTRAINT uq_review_dict_items_id_type UNIQUE (id, dict_type);

-- ============ 2. System taxonomy seed ============
INSERT INTO public.review_dict_items (
  org_id,
  dict_type,
  code,
  label,
  description,
  sort_order,
  enabled,
  is_system,
  created_by
)
VALUES
  -- MATERIAL
  (NULL, 'MATERIAL', 'PP', '聚丙烯', '主要基材为 PP', 1, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'PE', '聚乙烯', '主要基材为 PE', 2, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'ABS', 'ABS 塑料', '主要基材为 ABS', 3, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'PS', 'PS 塑料', '主要基材为 PS', 4, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'PET', 'PET 聚酯', '主要基材为 PET', 5, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'PETG', 'PETG 改性聚酯', '主要基材为 PETG', 6, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'PC', 'PC 塑料', '主要基材为 PC', 7, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'PVC', 'PVC 塑料', '主要基材为 PVC', 8, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'SILICONE', '硅胶', '主要基材为硅胶', 9, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'METAL', '金属', '主要基材为金属', 10, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'GLASS', '玻璃', '主要基材为玻璃', 11, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'CERAMIC', '陶瓷', '主要基材为陶瓷', 12, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'WOOD', '木材', '主要基材为木材', 13, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'LEATHER', '皮革', '主要基材为皮革', 14, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'PAPER', '纸类', '主要基材为纸类', 15, TRUE, TRUE, NULL),
  (NULL, 'MATERIAL', 'OTHER', '其他', '其他材质，必须填写说明', 16, TRUE, TRUE, NULL),
  -- PROCESS
  (NULL, 'PROCESS', 'FILM_MAKING', '花膜制作', '花膜、图案膜制作与准备环节', 1, TRUE, TRUE, NULL),
  (NULL, 'PROCESS', 'GRAVURE_PRINTING', '凹印/电雕制版', '常规花膜的凹印、电雕制版印刷环节', 2, TRUE, TRUE, NULL),
  (NULL, 'PROCESS', 'HEAT_TRANSFER', '热转印', '常规热转印加工', 3, TRUE, TRUE, NULL),
  (NULL, 'PROCESS', 'DIGITAL_HEAT_TRANSFER', '数码热转印', '数码打印花膜后的热转印', 4, TRUE, TRUE, NULL),
  (NULL, 'PROCESS', 'SCREEN_HEAT_TRANSFER', '丝印热转印', '丝印花膜配合热转印', 5, TRUE, TRUE, NULL),
  (NULL, 'PROCESS', 'UV_PRINTING', 'UV 打印', 'UV 直接印刷/打印工艺', 6, TRUE, TRUE, NULL),
  (NULL, 'PROCESS', 'SCREEN_PRINTING', '丝印', '直接丝网印刷', 7, TRUE, TRUE, NULL),
  (NULL, 'PROCESS', 'PAD_PRINTING', '移印', '移印工艺', 8, TRUE, TRUE, NULL),
  (NULL, 'PROCESS', 'HOT_STAMPING', '烫金/烫印', '烫金、烫印工艺', 9, TRUE, TRUE, NULL),
  (NULL, 'PROCESS', 'OTHER', '其他', '其他工艺，必须填写说明', 10, TRUE, TRUE, NULL),
  -- PROBLEM_DOMAIN
  (NULL, 'PROBLEM_DOMAIN', 'CUSTOMER_REQUIREMENT', '客户需求与标准', '客户需求、验收标准、测试标准未收集完整或未对齐', 1, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'TECHNICAL_FEASIBILITY', '技术评估与方案', '技术可行性、打样策略、新工艺/新材料前期风险预评估', 2, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'PROJECT_COMMUNICATION', '项目沟通与确认', '客户/内部沟通、确认、变更同步遗漏', 3, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'ARTWORK_DESIGN', '图稿与设计', '图稿、文字、尺寸、设计错误', 4, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'PLATE_FILM', '制版与花膜', '制版、花膜制作缺陷', 5, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'PROCESS', '工艺与参数', '转印温度、时间、压力、参数等工艺问题', 6, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'EQUIPMENT_FIXTURE', '设备与夹具', '设备故障、夹具定位问题', 7, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'MATERIAL_SURFACE', '材料与表面', '基材、表面处理、材料匹配问题', 8, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'PRODUCTION_OPERATION', '生产操作', '操作执行、排产、作业问题', 9, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'QUALITY_INSPECTION', '品质检验', '检验、判定、标准执行问题', 10, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'DELIVERY', '交付', '交期、数量、包装、发货问题', 11, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_DOMAIN', 'OTHER', '其他', '其他问题领域，必须填写说明', 12, TRUE, TRUE, NULL),
  -- PROBLEM_SYMPTOM
  (NULL, 'PROBLEM_SYMPTOM', 'TRANSFER_INCOMPLETE', '转印不完全', '图案未完整转印', 1, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'ADHESION_FAILURE', '附着力不足/脱落', '附着测试失败或实际脱落', 2, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'RESIDUAL_FILM', '残膜', '转印后残留花膜', 3, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'MISREGISTRATION', '偏位/套位偏差', '图案位置偏移、套位不准', 4, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'WRINKLING', '皱膜/褶皱', '花膜或产品表面皱褶', 5, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'COLOR_MISMATCH', '色差', '颜色与标准不一致', 6, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'DEFORMATION', '变形', '产品形状变形', 7, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'COLOR_FADING', '掉色/褪色', '使用后掉色、褪色', 8, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'WATER_RESISTANCE_FAILURE', '耐水失败', '耐水测试未通过', 9, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'ABRASION_RESISTANCE_FAILURE', '耐磨失败', '耐磨测试未通过', 10, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'ALCOHOL_RESISTANCE_FAILURE', '酒精/溶剂耐受失败', '酒精或溶剂耐受测试未通过', 11, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'SCRATCH_DAMAGE', '划伤/碰伤', '外观划伤、碰伤', 12, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'ARTWORK_ERROR', '图稿/文字/尺寸错误', '图稿内容、文字、尺寸错误', 13, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'DIMENSION_TOLERANCE', '尺寸/公差异常', '产品尺寸或公差超标', 14, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'EQUIPMENT_MALFUNCTION', '设备故障', '设备异常或故障', 15, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'DELIVERY_DELAY', '交期延误', '交期未达成', 16, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'QUANTITY_SHORTAGE', '数量短缺', '数量不足、短装', 17, TRUE, TRUE, NULL),
  (NULL, 'PROBLEM_SYMPTOM', 'OTHER', '其他', '其他问题表现，必须填写说明', 18, TRUE, TRUE, NULL)
ON CONFLICT (dict_type, code) WHERE org_id IS NULL
DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  enabled = EXCLUDED.enabled;

-- ============ 3. review_metadata ============
CREATE TABLE public.review_metadata (
  review_id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  material_other_text TEXT,
  process_other_text TEXT,
  problem_domain_other_text TEXT,
  problem_symptom_other_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_review_metadata_case_org
    FOREIGN KEY (review_id, org_id)
    REFERENCES public.review_cases(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_review_metadata_material_other_text CHECK (
    material_other_text IS NULL
    OR (
      char_length(btrim(material_other_text)) > 0
      AND char_length(material_other_text) <= 200
    )
  ),
  CONSTRAINT chk_review_metadata_process_other_text CHECK (
    process_other_text IS NULL
    OR (
      char_length(btrim(process_other_text)) > 0
      AND char_length(process_other_text) <= 200
    )
  ),
  CONSTRAINT chk_review_metadata_domain_other_text CHECK (
    problem_domain_other_text IS NULL
    OR (
      char_length(btrim(problem_domain_other_text)) > 0
      AND char_length(problem_domain_other_text) <= 200
    )
  ),
  CONSTRAINT chk_review_metadata_symptom_other_text CHECK (
    problem_symptom_other_text IS NULL
    OR (
      char_length(btrim(problem_symptom_other_text)) > 0
      AND char_length(problem_symptom_other_text) <= 200
    )
  )
);

-- ============ 4. review_metadata_items ============
CREATE TABLE public.review_metadata_items (
  review_id UUID NOT NULL,
  org_id UUID NOT NULL,
  metadata_type TEXT NOT NULL,
  dict_item_id UUID NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_review_metadata_items PRIMARY KEY (review_id, metadata_type, dict_item_id),
  CONSTRAINT fk_review_metadata_items_case_org
    FOREIGN KEY (review_id, org_id)
    REFERENCES public.review_cases(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_review_metadata_items_dict_item
    FOREIGN KEY (dict_item_id, metadata_type)
    REFERENCES public.review_dict_items(id, dict_type),
  CONSTRAINT chk_review_metadata_items_type CHECK (
    metadata_type IN ('MATERIAL', 'PROCESS', 'PROBLEM_DOMAIN', 'PROBLEM_SYMPTOM')
  ),
  CONSTRAINT chk_review_metadata_items_primary_scope CHECK (
    metadata_type = 'MATERIAL' OR is_primary = FALSE
  )
);

CREATE INDEX idx_review_metadata_items_org_review
  ON public.review_metadata_items(org_id, review_id);

CREATE INDEX idx_review_metadata_items_org_type_item
  ON public.review_metadata_items(org_id, metadata_type, dict_item_id);

CREATE INDEX idx_review_metadata_items_dict_item
  ON public.review_metadata_items(dict_item_id, metadata_type);

CREATE UNIQUE INDEX uq_review_metadata_items_primary_material
  ON public.review_metadata_items(review_id)
  WHERE metadata_type = 'MATERIAL' AND is_primary = TRUE;

-- ============ 5. RLS ============
ALTER TABLE public.review_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_metadata_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_metadata_select_org"
  ON public.review_metadata
  FOR SELECT TO authenticated
  USING (
    org_id::text = public.auth_org_id()
    AND public.auth_profile_id() IS NOT NULL
    AND (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('operator')
      OR public.auth_has_role('sales')
      OR public.auth_has_role('viewer')
    )
  );

CREATE POLICY "review_metadata_items_select_org"
  ON public.review_metadata_items
  FOR SELECT TO authenticated
  USING (
    org_id::text = public.auth_org_id()
    AND public.auth_profile_id() IS NOT NULL
    AND (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('operator')
      OR public.auth_has_role('sales')
      OR public.auth_has_role('viewer')
    )
  );

REVOKE ALL ON public.review_metadata FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_metadata TO authenticated;

REVOKE ALL ON public.review_metadata_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_metadata_items TO authenticated;

-- ============ 6. Audit entity type ============
ALTER TABLE public.review_audit_logs
  DROP CONSTRAINT chk_review_audit_entity_type;

ALTER TABLE public.review_audit_logs
  ADD CONSTRAINT chk_review_audit_entity_type CHECK (
    entity_type IN (
      'REVIEW',
      'TYPE_DETAILS',
      'MEMBER',
      'ASSIGNMENT',
      'ACTION',
      'REVIEW_METADATA'
    )
  );

-- ============ 7. Submit metadata gate helper ============
-- Internal helper only; no client execute grant.
CREATE OR REPLACE FUNCTION public.review_metadata_submit_missing(
  p_review_id UUID,
  p_org_id UUID
)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH meta AS (
    SELECT mi.metadata_type, d.code, mi.is_primary
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = p_org_id
  ),
  review AS (
    SELECT review_type
    FROM public.review_cases
    WHERE id = p_review_id
      AND org_id = p_org_id
  ),
  domains AS (
    SELECT code
    FROM meta
    WHERE metadata_type = 'PROBLEM_DOMAIN'
  )
  SELECT COALESCE(ARRAY(
    SELECT missing
    FROM (
      SELECT 'PROBLEM_DOMAIN'::TEXT AS missing
      WHERE NOT EXISTS (
        SELECT 1 FROM meta WHERE metadata_type = 'PROBLEM_DOMAIN'
      )
      UNION ALL
      SELECT 'PRIMARY_MATERIAL'::TEXT
      WHERE (
        EXISTS (
          SELECT 1 FROM review r WHERE r.review_type IN ('B', 'C')
        )
        OR EXISTS (
          SELECT 1 FROM meta WHERE metadata_type = 'MATERIAL'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM meta
        WHERE metadata_type = 'MATERIAL' AND is_primary = TRUE
      )
      UNION ALL
      SELECT 'PROCESS'::TEXT
      WHERE EXISTS (
        SELECT 1 FROM review r WHERE r.review_type IN ('B', 'C')
      )
      AND EXISTS (
        SELECT 1 FROM domains
        WHERE code IN ('PROCESS', 'EQUIPMENT_FIXTURE', 'PLATE_FILM')
      )
      AND NOT EXISTS (
        SELECT 1 FROM meta WHERE metadata_type = 'PROCESS'
      )
    ) missing_rows
    ORDER BY missing
  ), '{}'::TEXT[]);
$$;

-- ============ 8. RPC: review_upsert_metadata ============
CREATE OR REPLACE FUNCTION public.review_upsert_metadata(
  p_review_id UUID,
  p_expected_version INTEGER,
  p_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_old_version INTEGER;
  v_new_version INTEGER;
  v_reason TEXT;
  v_has_unknown BOOLEAN;
  v_has_unknown_other BOOLEAN;
  v_has_invalid_other_value BOOLEAN;
  v_has_invalid_material BOOLEAN;
  v_has_unknown_material_key BOOLEAN;
  v_has_invalid_process BOOLEAN;
  v_has_invalid_domain BOOLEAN;
  v_has_invalid_symptom BOOLEAN;
  v_has_duplicate BOOLEAN;
  v_has_invalid_code BOOLEAN;
  v_material_count INTEGER;
  v_primary_count INTEGER;
  v_material_other_selected BOOLEAN;
  v_process_other_selected BOOLEAN;
  v_domain_other_selected BOOLEAN;
  v_symptom_other_selected BOOLEAN;
  v_new_materials JSONB;
  v_new_processes JSONB;
  v_new_problem_domains JSONB;
  v_new_problem_symptoms JSONB;
  v_old_materials JSONB;
  v_old_processes JSONB;
  v_old_problem_domains JSONB;
  v_old_problem_symptoms JSONB;
  v_new_material_other_text TEXT;
  v_new_process_other_text TEXT;
  v_new_problem_domain_other_text TEXT;
  v_new_problem_symptom_other_text TEXT;
  v_old_material_other_text TEXT;
  v_old_process_other_text TEXT;
  v_old_problem_domain_other_text TEXT;
  v_old_problem_symptom_other_text TEXT;
  v_changed_dimensions TEXT[] := '{}'::TEXT[];
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF v_review_row.status = 'draft' THEN
    IF NOT COALESCE(
      v_actor_role IN ('admin', 'manager')
      OR (
        v_actor_role <> 'viewer'
        AND v_actor_profile_id IS NOT NULL
        AND (
          v_review_row.owner_id = v_actor_profile_id
          OR (
            v_review_row.pmo_id IS NOT NULL
            AND v_review_row.pmo_id = v_actor_profile_id
          )
        )
      ),
      FALSE
    ) THEN
      RETURN public.review_rpc_error('FORBIDDEN', '无编辑权限');
    END IF;
  ELSIF v_review_row.status IN ('submitted', 'closed') THEN
    IF v_actor_role NOT IN ('admin', 'manager') THEN
      RETURN public.review_rpc_error('FORBIDDEN', '仅管理员或主管可修正复盘分类');
    END IF;
  ELSE
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许修改复盘分类');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'metadata 必须是 JSON 对象');
  END IF;

  SELECT bool_or(
    key NOT IN ('materials', 'processes', 'problemDomains', 'problemSymptoms', 'other', 'reason')
  )
  INTO v_has_unknown
  FROM jsonb_object_keys(p_metadata) AS k(key);
  IF COALESCE(v_has_unknown, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'metadata 包含不允许的字段');
  END IF;

  IF (p_metadata ? 'reason') AND jsonb_typeof(p_metadata->'reason') NOT IN ('string', 'null') THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'reason 格式无效');
  END IF;

  IF v_review_row.status <> 'draft' THEN
    v_reason := NULLIF(btrim(COALESCE(p_metadata->>'reason', '')), '');
    IF v_reason IS NULL OR v_reason = '' THEN
      RETURN public.review_rpc_error('INVALID_METADATA', '提交后修正必须填写理由');
    END IF;
    IF char_length(v_reason) > 1000 THEN
      RETURN public.review_rpc_error('INVALID_METADATA', '修正理由过长');
    END IF;
  END IF;

  IF (p_metadata ? 'materials') AND jsonb_typeof(p_metadata->'materials') <> 'array' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'materials 必须是数组');
  END IF;
  IF (p_metadata ? 'processes') AND jsonb_typeof(p_metadata->'processes') <> 'array' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'processes 必须是数组');
  END IF;
  IF (p_metadata ? 'problemDomains') AND jsonb_typeof(p_metadata->'problemDomains') <> 'array' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'problemDomains 必须是数组');
  END IF;
  IF (p_metadata ? 'problemSymptoms') AND jsonb_typeof(p_metadata->'problemSymptoms') <> 'array' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'problemSymptoms 必须是数组');
  END IF;
  IF (p_metadata ? 'other') AND jsonb_typeof(p_metadata->'other') <> 'object' THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'other 必须是 JSON 对象');
  END IF;

  IF p_metadata ? 'other' THEN
    SELECT bool_or(
      key NOT IN (
        'materialOtherText',
        'processOtherText',
        'problemDomainOtherText',
        'problemSymptomOtherText'
      )
    )
    INTO v_has_unknown_other
    FROM jsonb_object_keys(p_metadata->'other') AS k(key);
    IF COALESCE(v_has_unknown_other, false) THEN
      RETURN public.review_rpc_error('INVALID_METADATA', 'other 包含不允许的字段');
    END IF;

    SELECT bool_or(jsonb_typeof(v) NOT IN ('string', 'null'))
    INTO v_has_invalid_other_value
    FROM jsonb_each(p_metadata->'other') AS e(k, v);
    IF COALESCE(v_has_invalid_other_value, false) THEN
      RETURN public.review_rpc_error('INVALID_METADATA', 'other 文本格式无效');
    END IF;
  END IF;

  SELECT bool_or(
    jsonb_typeof(e) <> 'object'
    OR NOT (e ? 'code')
    OR jsonb_typeof(e->'code') <> 'string'
    OR btrim(e->>'code') = ''
    OR (
      e ? 'isPrimary'
      AND jsonb_typeof(e->'isPrimary') <> 'boolean'
    )
  )
  INTO v_has_invalid_material
  FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e;
  IF COALESCE(v_has_invalid_material, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'materials 格式无效');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_object_keys(e) AS k(key)
      WHERE key NOT IN ('code', 'isPrimary')
    )
  )
  INTO v_has_unknown_material_key;
  IF v_has_unknown_material_key THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'materials 包含不允许的字段');
  END IF;

  SELECT bool_or(
    jsonb_typeof(e) <> 'string' OR btrim(e #>> '{}') = ''
  )
  INTO v_has_invalid_process
  FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e;
  IF COALESCE(v_has_invalid_process, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'processes 格式无效');
  END IF;

  SELECT bool_or(
    jsonb_typeof(e) <> 'string' OR btrim(e #>> '{}') = ''
  )
  INTO v_has_invalid_domain
  FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e;
  IF COALESCE(v_has_invalid_domain, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'problemDomains 格式无效');
  END IF;

  SELECT bool_or(
    jsonb_typeof(e) <> 'string' OR btrim(e #>> '{}') = ''
  )
  INTO v_has_invalid_symptom
  FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e;
  IF COALESCE(v_has_invalid_symptom, false) THEN
    RETURN public.review_rpc_error('INVALID_METADATA', 'problemSymptoms 格式无效');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT 'MATERIAL' AS metadata_type, btrim(e->>'code') AS code
      FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROCESS', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROBLEM_DOMAIN', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROBLEM_SYMPTOM', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
    ) codes
    GROUP BY metadata_type, code
    HAVING count(*) > 1
  )
  INTO v_has_duplicate;
  IF v_has_duplicate THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '同一分类不能重复');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT 'MATERIAL' AS metadata_type, btrim(e->>'code') AS code
      FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROCESS', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROBLEM_DOMAIN', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
      UNION ALL
      SELECT 'PROBLEM_SYMPTOM', btrim(e #>> '{}')
      FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
    ) codes
    WHERE NOT EXISTS (
      SELECT 1 FROM public.review_dict_items d
      WHERE d.dict_type = codes.metadata_type
        AND d.code = codes.code
        AND d.org_id IS NULL
        AND d.is_system = TRUE
        AND d.enabled = TRUE
    )
  )
  INTO v_has_invalid_code;
  IF v_has_invalid_code THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '包含未知或不可用的分类');
  END IF;

  SELECT count(*)
  INTO v_material_count
  FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e;

  SELECT count(*)
  INTO v_primary_count
  FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
  WHERE COALESCE((e->>'isPrimary')::boolean, false);

  IF v_material_count > 0 AND v_primary_count <> 1 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '材质必须且只能有一个主要材质');
  END IF;

  v_new_material_other_text := NULLIF(btrim(COALESCE(p_metadata->'other'->>'materialOtherText', '')), '');
  v_new_process_other_text := NULLIF(btrim(COALESCE(p_metadata->'other'->>'processOtherText', '')), '');
  v_new_problem_domain_other_text := NULLIF(btrim(COALESCE(p_metadata->'other'->>'problemDomainOtherText', '')), '');
  v_new_problem_symptom_other_text := NULLIF(btrim(COALESCE(p_metadata->'other'->>'problemSymptomOtherText', '')), '');

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
    WHERE btrim(e->>'code') = 'OTHER'
  )
  INTO v_material_other_selected;
  IF NOT v_material_other_selected THEN
    v_new_material_other_text := NULL;
  ELSIF v_new_material_other_text IS NULL THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '选择其他材质时必须填写说明');
  ELSIF char_length(v_new_material_other_text) > 200 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '其他材质说明过长');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
    WHERE btrim(e #>> '{}') = 'OTHER'
  )
  INTO v_process_other_selected;
  IF NOT v_process_other_selected THEN
    v_new_process_other_text := NULL;
  ELSIF v_new_process_other_text IS NULL THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '选择其他工艺时必须填写说明');
  ELSIF char_length(v_new_process_other_text) > 200 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '其他工艺说明过长');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
    WHERE btrim(e #>> '{}') = 'OTHER'
  )
  INTO v_domain_other_selected;
  IF NOT v_domain_other_selected THEN
    v_new_problem_domain_other_text := NULL;
  ELSIF v_new_problem_domain_other_text IS NULL THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '选择其他问题领域时必须填写说明');
  ELSIF char_length(v_new_problem_domain_other_text) > 200 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '其他问题领域说明过长');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
    WHERE btrim(e #>> '{}') = 'OTHER'
  )
  INTO v_symptom_other_selected;
  IF NOT v_symptom_other_selected THEN
    v_new_problem_symptom_other_text := NULL;
  ELSIF v_new_problem_symptom_other_text IS NULL THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '选择其他问题表现时必须填写说明');
  ELSIF char_length(v_new_problem_symptom_other_text) > 200 THEN
    RETURN public.review_rpc_error('INVALID_METADATA', '其他问题表现说明过长');
  END IF;

  v_new_materials := COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'code', btrim(e->>'code'),
        'isPrimary', COALESCE((e->>'isPrimary')::boolean, false)
      )
      ORDER BY btrim(e->>'code')
    )
    FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
  ), '[]'::jsonb);

  v_new_processes := COALESCE((
    SELECT jsonb_agg(btrim(e #>> '{}') ORDER BY btrim(e #>> '{}'))
    FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
  ), '[]'::jsonb);

  v_new_problem_domains := COALESCE((
    SELECT jsonb_agg(btrim(e #>> '{}') ORDER BY btrim(e #>> '{}'))
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
  ), '[]'::jsonb);

  v_new_problem_symptoms := COALESCE((
    SELECT jsonb_agg(btrim(e #>> '{}') ORDER BY btrim(e #>> '{}'))
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
  ), '[]'::jsonb);

  v_old_materials := COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('code', d.code, 'isPrimary', mi.is_primary)
      ORDER BY d.code
    )
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = v_actor_org_id
      AND mi.metadata_type = 'MATERIAL'
  ), '[]'::jsonb);

  v_old_processes := COALESCE((
    SELECT jsonb_agg(d.code ORDER BY d.code)
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = v_actor_org_id
      AND mi.metadata_type = 'PROCESS'
  ), '[]'::jsonb);

  v_old_problem_domains := COALESCE((
    SELECT jsonb_agg(d.code ORDER BY d.code)
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = v_actor_org_id
      AND mi.metadata_type = 'PROBLEM_DOMAIN'
  ), '[]'::jsonb);

  v_old_problem_symptoms := COALESCE((
    SELECT jsonb_agg(d.code ORDER BY d.code)
    FROM public.review_metadata_items mi
    JOIN public.review_dict_items d
      ON d.id = mi.dict_item_id
     AND d.dict_type = mi.metadata_type
    WHERE mi.review_id = p_review_id
      AND mi.org_id = v_actor_org_id
      AND mi.metadata_type = 'PROBLEM_SYMPTOM'
  ), '[]'::jsonb);

  SELECT material_other_text,
         process_other_text,
         problem_domain_other_text,
         problem_symptom_other_text
    INTO v_old_material_other_text,
         v_old_process_other_text,
         v_old_problem_domain_other_text,
         v_old_problem_symptom_other_text
    FROM public.review_metadata m
    WHERE m.review_id = p_review_id
      AND m.org_id = v_actor_org_id;

  IF v_old_materials IS NOT DISTINCT FROM v_new_materials
     AND v_old_processes IS NOT DISTINCT FROM v_new_processes
     AND v_old_problem_domains IS NOT DISTINCT FROM v_new_problem_domains
     AND v_old_problem_symptoms IS NOT DISTINCT FROM v_new_problem_symptoms
     AND v_old_material_other_text IS NOT DISTINCT FROM v_new_material_other_text
     AND v_old_process_other_text IS NOT DISTINCT FROM v_new_process_other_text
     AND v_old_problem_domain_other_text IS NOT DISTINCT FROM v_new_problem_domain_other_text
     AND v_old_problem_symptom_other_text IS NOT DISTINCT FROM v_new_problem_symptom_other_text
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'newVersion', v_review_row.version,
        'metadata', jsonb_build_object(
          'materials', v_new_materials,
          'processes', v_new_processes,
          'problemDomains', v_new_problem_domains,
          'problemSymptoms', v_new_problem_symptoms,
          'other', jsonb_build_object(
            'materialOtherText', v_new_material_other_text,
            'processOtherText', v_new_process_other_text,
            'problemDomainOtherText', v_new_problem_domain_other_text,
            'problemSymptomOtherText', v_new_problem_symptom_other_text
          )
        )
      )
    );
  END IF;

  IF v_old_materials IS DISTINCT FROM v_new_materials THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'MATERIAL');
  END IF;
  IF v_old_processes IS DISTINCT FROM v_new_processes THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'PROCESS');
  END IF;
  IF v_old_problem_domains IS DISTINCT FROM v_new_problem_domains THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'PROBLEM_DOMAIN');
  END IF;
  IF v_old_problem_symptoms IS DISTINCT FROM v_new_problem_symptoms THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'PROBLEM_SYMPTOM');
  END IF;
  IF v_old_material_other_text IS DISTINCT FROM v_new_material_other_text
     OR v_old_process_other_text IS DISTINCT FROM v_new_process_other_text
     OR v_old_problem_domain_other_text IS DISTINCT FROM v_new_problem_domain_other_text
     OR v_old_problem_symptom_other_text IS DISTINCT FROM v_new_problem_symptom_other_text
  THEN
    v_changed_dimensions := array_append(v_changed_dimensions, 'OTHER_TEXT');
  END IF;

  v_old_version := v_review_row.version;

  DELETE FROM public.review_metadata_items
    WHERE review_id = p_review_id
      AND org_id = v_actor_org_id;

  INSERT INTO public.review_metadata_items (
    review_id,
    org_id,
    metadata_type,
    dict_item_id,
    is_primary
  )
  SELECT
    p_review_id,
    v_actor_org_id,
    codes.metadata_type,
    d.id,
    codes.is_primary
  FROM (
    SELECT
      'MATERIAL' AS metadata_type,
      btrim(e->>'code') AS code,
      COALESCE((e->>'isPrimary')::boolean, false) AS is_primary
    FROM jsonb_array_elements(COALESCE(p_metadata->'materials', '[]'::jsonb)) e
    UNION ALL
    SELECT 'PROCESS', btrim(e #>> '{}'), false
    FROM jsonb_array_elements(COALESCE(p_metadata->'processes', '[]'::jsonb)) e
    UNION ALL
    SELECT 'PROBLEM_DOMAIN', btrim(e #>> '{}'), false
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemDomains', '[]'::jsonb)) e
    UNION ALL
    SELECT 'PROBLEM_SYMPTOM', btrim(e #>> '{}'), false
    FROM jsonb_array_elements(COALESCE(p_metadata->'problemSymptoms', '[]'::jsonb)) e
  ) codes
  JOIN public.review_dict_items d
    ON d.dict_type = codes.metadata_type
   AND d.code = codes.code
   AND d.org_id IS NULL
   AND d.is_system = TRUE
   AND d.enabled = TRUE;

  INSERT INTO public.review_metadata (
    review_id,
    org_id,
    material_other_text,
    process_other_text,
    problem_domain_other_text,
    problem_symptom_other_text
  )
  VALUES (
    p_review_id,
    v_actor_org_id,
    v_new_material_other_text,
    v_new_process_other_text,
    v_new_problem_domain_other_text,
    v_new_problem_symptom_other_text
  )
  ON CONFLICT (review_id) DO UPDATE SET
    material_other_text = EXCLUDED.material_other_text,
    process_other_text = EXCLUDED.process_other_text,
    problem_domain_other_text = EXCLUDED.problem_domain_other_text,
    problem_symptom_other_text = EXCLUDED.problem_symptom_other_text,
    updated_at = NOW();

  UPDATE public.review_cases rc
    SET version = rc.version + 1,
        updated_at = NOW()
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version INTO v_new_version;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'REVIEW_METADATA',
    p_review_id,
    'REVIEW_METADATA_UPDATED',
    jsonb_build_object(
      'changedDimensions', to_jsonb(v_changed_dimensions),
      'beforeCodes', jsonb_build_object(
        'materials', v_old_materials,
        'processes', v_old_processes,
        'problemDomains', v_old_problem_domains,
        'problemSymptoms', v_old_problem_symptoms
      ),
      'afterCodes', jsonb_build_object(
        'materials', v_new_materials,
        'processes', v_new_processes,
        'problemDomains', v_new_problem_domains,
        'problemSymptoms', v_new_problem_symptoms
      )
    ),
    v_old_version,
    v_new_version
  );

  IF v_review_row.status <> 'draft' THEN
    INSERT INTO public.review_timeline_events (
      org_id,
      review_id,
      event_type,
      actor_profile_id,
      payload,
      version
    )
    VALUES (
      v_actor_org_id,
      p_review_id,
      'REVIEW_METADATA_UPDATED',
      v_actor_profile_id,
      jsonb_build_object('changedDimensions', to_jsonb(v_changed_dimensions)),
      v_new_version
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'newVersion', v_new_version,
      'metadata', jsonb_build_object(
        'materials', v_new_materials,
        'processes', v_new_processes,
        'problemDomains', v_new_problem_domains,
        'problemSymptoms', v_new_problem_symptoms,
        'other', jsonb_build_object(
          'materialOtherText', v_new_material_other_text,
          'processOtherText', v_new_process_other_text,
          'problemDomainOtherText', v_new_problem_domain_other_text,
          'problemSymptomOtherText', v_new_problem_symptom_other_text
        )
      )
    )
  );
END;
$$;

-- ============ 9. RPC: review_submit metadata gate ============
-- Preserves the current lifecycle behavior and only adds the DB-side
-- metadata completeness gate before the version bump.
CREATE OR REPLACE FUNCTION public.review_submit(
  p_review_id UUID,
  p_expected_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_role TEXT;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
  v_old_version INTEGER;
  v_new_version INTEGER;
  v_submitted_at TIMESTAMPTZ;
  v_closed_at TIMESTAMPTZ;
  v_missing_dimensions TEXT[] := '{}'::TEXT[];
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无有效档案');
  END IF;

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', '复盘不存在');
  END IF;

  IF NOT COALESCE(
    v_actor_role IN ('admin', 'manager')
    OR (
      v_actor_role <> 'viewer'
      AND v_actor_profile_id IS NOT NULL
      AND (
        v_review_row.owner_id = v_actor_profile_id
        OR (
          v_review_row.pmo_id IS NOT NULL
          AND v_review_row.pmo_id = v_actor_profile_id
        )
      )
    ),
    FALSE
  ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', '无提交权限');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version <> v_review_row.version THEN
    RETURN public.review_rpc_error('VERSION_CONFLICT', '版本已变化');
  END IF;

  IF v_review_row.status = 'submitted' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'OK',
      'message', 'success',
      'data', jsonb_build_object(
        'status', v_review_row.status,
        'version', v_review_row.version,
        'submitted_at', v_review_row.submitted_at,
        'closed_at', v_review_row.closed_at
      )
    );
  END IF;

  IF v_review_row.status <> 'draft' THEN
    RETURN public.review_rpc_error('INVALID_TRANSITION', '当前状态不允许提交');
  END IF;

  IF btrim(v_review_row.title) = '' THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.review_type NOT IN ('A', 'B', 'C') THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.description IS NULL OR btrim(v_review_row.description) = '' THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.risk_level IS NULL THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.risk_level IN ('RED', 'YELLOW')
    AND (v_review_row.risk_reason IS NULL OR btrim(v_review_row.risk_reason) = '') THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;
  IF v_review_row.owner_id IS NULL THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;

  PERFORM 1
    FROM public.review_type_details d
    WHERE d.review_id = p_review_id
      AND d.org_id = v_actor_org_id;
  IF NOT FOUND THEN
    RETURN public.review_rpc_error('INCOMPLETE_REVIEW', '复盘信息不完整');
  END IF;

  v_missing_dimensions := public.review_metadata_submit_missing(
    p_review_id,
    v_actor_org_id
  );
  IF v_missing_dimensions <> '{}'::TEXT[] THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'METADATA_INCOMPLETE',
      'message', '复盘分类信息不完整，暂不能提交',
      'data', jsonb_build_object(
        'missingDimensions', to_jsonb(v_missing_dimensions)
      )
    );
  END IF;

  v_old_version := v_review_row.version;

  UPDATE public.review_cases rc
    SET status = 'submitted',
        submitted_at = NOW(),
        submitted_by_profile_id = v_actor_profile_id,
        version = rc.version + 1,
        updated_at = NOW()
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id
    RETURNING version, submitted_at, closed_at
    INTO v_new_version, v_submitted_at, v_closed_at;

  INSERT INTO public.review_audit_logs (
    org_id,
    review_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    changes,
    version_before,
    version_after
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    v_actor_profile_id,
    'REVIEW',
    p_review_id,
    'REVIEW_SUBMITTED',
    jsonb_build_object(
      'status',
      jsonb_build_object('before', 'draft', 'after', 'submitted')
    ),
    v_old_version,
    v_new_version
  );

  INSERT INTO public.review_timeline_events (
    org_id,
    review_id,
    event_type,
    actor_profile_id,
    payload,
    version
  )
  VALUES (
    v_actor_org_id,
    p_review_id,
    'REVIEW_SUBMITTED',
    v_actor_profile_id,
    jsonb_build_object('from_status', 'draft', 'to_status', 'submitted'),
    v_new_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object(
      'status', 'submitted',
      'version', v_new_version,
      'submitted_at', v_submitted_at,
      'closed_at', v_closed_at
    )
  );
END;
$$;

-- ============ 10. Function execute privileges ============
REVOKE ALL ON FUNCTION public.review_metadata_submit_missing(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.review_upsert_metadata(UUID, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_upsert_metadata(UUID, INTEGER, JSONB)
  TO authenticated;

REVOKE ALL ON FUNCTION public.review_submit(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_submit(UUID, INTEGER)
  TO authenticated;

COMMIT;
