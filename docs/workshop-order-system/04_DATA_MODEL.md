# 数据模型 V1

> Phase 0 仅定义模型，不执行 Production migration。

## 1. 命名规则

未来正式表统一使用 `wos_` 前缀。

业务外键使用 `profiles.id`。客户、项目、订单如来自其他正式模块，应保留外部引用 ID 和快照字段，避免跨系统显示失真。

## 2. 核心实体

### `wos_production_orders`

生产单主表：

- id
- organization_id
- customer_id / customer_name_snapshot
- project_id / project_name_snapshot
- order_number
- product_name
- sales_owner_profile_id
- project_owner_profile_id
- priority
- is_urgent
- version_label
- workflow_status
- requested_quantity
- current_batch_quantity
- planned_ship_date
- split_delivery
- product_material
- surface_treatment
- pattern_scope
- seam_tolerance
- position_reference
- customer_acceptance_standard
- packaging_method
- carton_quantity
- label_marking_rule
- created_by_profile_id
- submitted_at
- closed_at
- created_at / updated_at

### `wos_sampling_requests`

打烊申请主表：

- id
- organization_id
- customer_id / snapshot
- project_id / snapshot
- product_name
- product_owner_profile_id
- request_stage (`UNESTABLISHED` / `ESTABLISHED`)
- objectives (array/json)
- version_label
- is_urgent
- workflow_status
- result_decision
- product_material
- surface_treatment
- sample_input_quantity
- required_good_quantity
- special_fixture_required
- film_type
- risk_notes
- submitted_at
- sampling_completed_at
- closed_at
- created_by_profile_id
- created_at / updated_at

### `wos_resource_readiness`

一条任务对应多种资源：

- id
- entity_type (`PRODUCTION_ORDER` / `SAMPLING_REQUEST`)
- entity_id
- resource_type (`FILM` / `FIXTURE` / `INCOMING_MATERIAL` / `SIGNED_SAMPLE`)
- status
- expected_at
- arrived_at
- quantity_expected
- quantity_arrived
- version_label
- confirmed_by_profile_id
- confirmed_at
- note
- created_at / updated_at

唯一约束：`entity_type + entity_id + resource_type`。

### `wos_reference_images`

- id
- entity_type
- entity_id
- category
- storage_bucket
- storage_path
- file_name
- mime_type
- file_size
- width / height
- caption
- version_label
- is_current_baseline
- supersedes_image_id
- superseded_at
- uploaded_by_profile_id
- uploaded_at
- created_at

图片类型：

- FILM_PATTERN
- PRODUCT
- CUSTOMER_APPROVED_SAMPLE
- SIGNED_SAMPLE
- SAMPLING_RESULT
- PACKAGING_LABEL
- DEFECT_RISK
- OTHER

### `wos_visual_baselines`

把多个图片组合成一次正式生产基准：

- id
- entity_type
- entity_id
- version_label
- status (`DRAFT` / `CURRENT` / `SUPERSEDED`)
- confirmed_by_office_profile_id
- confirmed_by_workshop_profile_id
- office_confirmed_at
- workshop_confirmed_at
- created_at
- superseded_at

### `wos_visual_baseline_items`

- baseline_id
- reference_image_id
- display_order
- is_required

### `wos_schedule_slots`

- id
- entity_type
- entity_id
- task_type
- machine_id / machine_label
- planned_start_at
- planned_end_at
- planned_quantity
- priority
- status
- scheduled_by_profile_id
- scheduled_at
- note

### `wos_sampling_technical_records`

- id
- sampling_request_id
- attempt_number
- machine_label
- temperature
- transfer_seconds
- roller_hardness
- fixture_mode
- pressure_level
- pressure_note
- pretreatment
- film_version_label
- estimated_bulk_efficiency
- result_decision
- failure_reason
- bulk_risk_notes
- improvement_recommendation
- technician_profile_id
- completed_at
- created_at

每次重新打烊形成新 attempt，不覆盖旧记录。

### `wos_production_runs`

- id
- production_order_id
- schedule_slot_id
- run_number
- machine_label
- started_at
- paused_at
- completed_at
- planned_quantity
- good_quantity
- defective_quantity
- status
- operator_profile_id
- technician_profile_id
- supervisor_profile_id
- process_notes
- exception_notes

### `wos_confirmations`

- id
- entity_type
- entity_id
- confirmation_type
- decision
- profile_id
- role_snapshot
- note
- confirmed_at

确认类型：

- OFFICE_COMPLETENESS
- TECHNICAL
- WORKSHOP_SUPERVISOR
- QUALITY
- VISUAL_BASELINE
- PROJECT_OWNER_RESULT
- START_RELEASE

### `wos_blockers`

- id
- entity_type
- entity_id
- blocker_code
- blocker_category
- description
- status (`OPEN` / `RESOLVED` / `WAIVED`)
- opened_by_profile_id
- resolved_by_profile_id
- opened_at
- resolved_at
- resolution_note

### `wos_status_history`

- id
- entity_type
- entity_id
- previous_status
- next_status
- actor_profile_id
- actor_role
- reason_code
- note
- metadata
- created_at

### `wos_comments`

办公室和车间围绕任务的结构化沟通记录，不替代正式字段和确认。

## 3. 附件与存储

- 正式图片默认私有 bucket。
- 数据库仅存路径和 metadata，不存 base64。
- 浏览器通过授权 signed URL 或受控下载接口访问。
- 图片删除采用逻辑废弃/替代，已作为正式基准使用的图片不得物理删除，除非走管理员审计流程。

## 4. 索引建议

- production order: status, planned ship date, owner, customer, order number
- sampling request: status, result, technician, customer, created time
- readiness: entity + resource type + status
- schedule: planned start, machine, status
- blockers: entity + open status
- reference images: entity + category + current baseline + version
- status history: entity + created time

## 5. RLS 原则

未来正式上线时：

- Sales/Project Owner 仅访问本人负责或显式共享的项目任务。
- Workshop/Technician 访问组织内已提交到车间的任务。
- Manager/Admin 访问组织范围。
- 客户图片和生产资料不向匿名角色开放。
- 高风险状态变更通过受控 RPC / server action，不允许浏览器任意 update status。
- service-role 不进入客户端。

## 6. 不可静默覆盖字段

以下修改必须版本化或写审计：

- 订单版本
- 花膜版本
- 当前生产基准图片
- 客户确认样
- 技术参数
- 打烊结果
- 包装/标签规则
- 计划出货日期
- 数量
- 开工放行结论
