# WOS P2 M1 | 车间物料齐套与现版签样证据（代码验收基线，未安装）

**Issue:** #266. **Branch:** `review/wos-p2-material-readiness-m1-20261120`. **Parent:** Draft PR #265 exact HEAD `ea8c05539d508c7afb332d5c850bc6fc01ac773e`.

本文件为非生产业务代码与离线证据合约，不是 SQL Migration，不授权任何数据库、RLS、Storage、Gate、Preview 或生产变更。

## 1. 本轮已经真实开发的功能

- 复用 `LiveQaWorkshopReadiness`、`LiveQaHandoffReadOnly` 及 `evaluateWosP2Readiness`，增加读取现有 RLS `wos_resource_readiness` 的 `expected_at`、`arrived_at`、`version_label`、`quantity_expected`、`quantity_arrived`、`confirmed_by_profile_id`、`confirmed_at`、`note`，显示真实预期到货、实际到货、来料数量缺口及异常备注。无值显示“未登记”；单纯显示不改变原记录，不写数据库。
- 复用 `LiveQaWorkshopActions` 已有 `CONFIRM_MATERIAL` 控件和 4 类状态；增加每种物料核对指导、来料数量差额的本地预览，不扩大网络请求的字段、RPC、客户端标志或操作权限。未单独开启 QA 写授权前操作按钮仍不可用。
- 现有齐套工作台及独立只读 QA 页面分别展示 CURRENT 基准数量、生产版本标签、办公室确认时间是否已记录、车间确认时间是否已记录；上述时间摘要**不等于**独立人员或图像 SHA-256 的证明，UI 明确保持人工放行拦截。若当前数字事务版本没有可接受的交接历史，即使四项物料数据满足条件也不显示可提交人工齐套审核。
- 新 `p2-material-version-evidence.ts`：审查旧 v7 交接与后续 `wos_qa_p2_action_receipts` 数字事务版本（CAS）是否**候选连续**。验证同组织、订单、唯一 request ID、指纹、expected_version→response.version、动作 `CONFIRM_MATERIAL`、返回状态和缺口。不允许仅凭这条链给 v8/v9 当前交接“已验收”：无不可变生产资料摘要与独立回执认证，恒为 `currentRevisionHandoffProven=false`、`canStart=false`。
- 新 `p2-visual-evidence.ts`：仅离线校验 `wos_visual_baselines` / `wos_visual_baseline_items` / `wos_reference_images` / `wos_qa_verified_image_proofs` 所组成的**候选**证据。必须唯一 CURRENT、组织/订单/版本匹配、无 superseded、办公室与车间两名不同 ID 且在基准建立后分别确认、必需分类图片 READY+私有路径、证明 SHA-256/对象版本/未过期。即使候选齐全，仍 `canStart=false`，且不能代替实物签样和技术主管放行。
- 新单元测试运行真实 TypeScript 纯函数：四项物料缺失/不齐、数量短缺、旧生产版本、签样只上传、重复/越权 CAS、错误 payload、v8/v9 候选链、CURRENT 双确认、图片证明过期/替代/错误组织等。覆盖读取组件无直接 DML/RPC 的源码负向限制。没有数据库事务或真实浏览器写测试。

## 2. 真实非生产 QA Schema 核对

Supabase project `xulmpqaknlwqqculbsek`；合成订单 `953d2204-3e65-4b75-b10e-c6e97f1bbb56`，`WAITING_MATERIAL/v7`、`version_label=QA-R6`，六步交接已在旧 SHA 浏览器验收。四类资源记录 0、当前 baseline 0、1 条图片证明、历史阻塞 1 条但 RESOLVED。Office/Operator DB 写 Gate OFF。

现存结构（均不得复建）：`wos_resource_readiness` 唯一 `(entity_type,entity_id,resource_type)`，4 类 `FILM/FIXTURE/INCOMING_MATERIAL/SIGNED_SAMPLE`，存在 `expected_at` / `arrived_at` 但旧 P2 Operator SQL `CONFIRM_MATERIAL` 事务并未填充这两个字段；现有只读查询显示其缺失而非虚构时间。实际 RPC 后到货时间、确认人和样品证据如何写入须单独审核。`wos_visual_baselines` 有 CURRENT/SUPERSEDED、双方确认列；`wos_visual_baseline_items` 关联 `wos_reference_images`；私有图片证明存 `wos_qa_verified_image_proofs`。普通 authenticated 角色对 material / baseline / blocker / confirmations 只有 SELECT，无直接 INSERT/UPDATE；现有 Operator RPC `wos_qa_p2_operator_action` 为受 Gate 约束的 SECURITY DEFINER，当前未获调用授权。

**图片枚举与物料枚举不相同（经 QA 数据库 CHECK 约束确认）：** 物料表使用 `FILM`；`wos_reference_images.category` 中花膜图案是 `FILM_PATTERN`，客户确认样是 `CUSTOMER_APPROVED_SAMPLE`，产品图 `PRODUCT`，大货签样 `SIGNED_SAMPLE`。其他实际允许类别为 `SAMPLING_RESULT`、`PACKAGING_LABEL`、`DEFECT_RISK`、`OTHER`。新视觉候选合约严格采用实际图片表类别，不能误用物料 `FILM` 当图片类别。离线合约测试通过也不意味着物理签样已签署。

## 3. 关键技术限制与设计约束（不可隐瞒）

**两个版本不是同一种东西。**

- `wos_production_orders.version`：每次成功 P2 CAS 事务递增的整型计数，v7 → v8 → v9 可能只是物料更新。
- `wos_production_orders.version_label`：生产图案、产品、客户签样的生产资料版本，如 `QA-R6`。没有可审计的不可变内容摘要就不能保证数字版本增加时关键字段没有变化。

现有 `wos_qa_p2_action_receipts` 仅含 request_id、organization_id、order_id、actor_profile_id、action、expected_version、payload_fingerprint、response_json、created_at；**缺少独立不可变的 production spec digest、origin business revision 和签名认可的 receipt-to-snapshot 关联**。因此 v8+ 连续物料回执只能作为待审候选，不能视为 PR #265 v7-only handoff proof 的替代。

**必须后续独立设计审核、单独授权才能实施的写入契约：**

1. 为生产关键字段（客户/产品、图案、位置、规格/材料、签样、验收标准、当前图片基准、数量批次）定义规范化 `production_spec_digest`，禁止由客户端随意提交摘要；必须经受信任的 DB 事务或已签名证明生成。
2. 将每个原子回执与同一订单、组织、CAS 前后版本、`version_label`、摘要 before/after、动作类型及独立参与者绑定，留存原始回执；只在事务已验证且关键资料摘要未变时允许继承**被认证过的交接基准**。关键字段变化必须触发旧签样、Film 版本和车间视觉确认失效，重新完成受控交接。
3. 物料记录真实预计/实到时间及角色审计。任何 `CONFIRM_MATERIAL` 成功都不得自行证明整单可开工；缺少必要图片、签样或角色签认时留在 `WAITING_MATERIAL` / 受控 `READINESS_CHECK`。
4. 设计一条原子、幂等、版本绑定的 `CURRENT` baseline 选择/替换/双人确认事务，确保唯一 CURRENT、镜像私有对象证明与数据库图片记录绑定；不允许旧基准自动成为新版本。
5. OFFICE 签认和 WORKSHOP 复核应来源于各自真实 Supabase 用户，禁止自签自审、client 指定 profileId、越组织读取/写入或直接向 `authenticated` 授予裸 DML。代码纯函数不是数据库授权或独立 Reviewer。
6. `WOS_P2_WRITE_ROLES`、`WOS_P2_QA_MUTATIONS_ENABLED`、`NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED`、数据库 `OPERATOR_WRITES` 与 `OFFICE_WRITES` 必须仍保持受限。旧 P7 submit 不得开启。正式环境不得使用 QA 脚本。

## 4. M1 可验收与 M2 尚需真实 QA 事务

| 功能 | M1 状态 | 真实 QA 写入所缺条件 |
| --- | --- | --- |
| 花膜 | 可读版本/ETA/实到/确认记录；状态判断已有 | 真实到货时间、版本绑定、原子确认 QA |
| 夹具 | 已有 FIT_VERIFIED 状态与核对指引 | 实测适配证据、确认责任人、QA 事务 |
| 来料 | 应到/实到数量和差额可读；本地预览 | 版本当前批次锁定、数量短缺/重复提交 QA |
| 签样 | 已有 VERIFIED 状态及版本核对 | 物理签样与 CURRENT 图片证据双重绑定 |
| 视觉 CURRENT 基准 | 离线候选合约、双人确认验证 | 可信私有图关联、审核后专属 RPC、QA |
| 办公室签认 | 离线独立确认检查 | 真实账号受限原子签认 |
| 车间确认 | 离线不同人员/新版本复核检查 | 真实车间角色、不可继承旧确认 |
| v8+ 版本 | CAS/回执候选连续检查，绝不声称已证实 | DB 原子 spec digest 与跨版本正式证明 |
| 阻断与开工 | 任何未齐套均否决；`canStart=false` | 独立技术/主管/品质审查，人工开工门槛 |

## 5. 最小下一轮 QA E2E 授权模板（尚未授予）

只针对固定非生产 QA 项目和**新审核后的精确业务 SHA**，需 Owner 新授权：独立 Reviewer 复核 M2 事务 SQL/RPC、RLS、私有图片对象/签名、回滚与审计；先在隔离 PG17 仿真，证明匿名/Viewer/跨组织拒绝及版本 CAS 原子性。随后仅针对**一张新合成测试订单**（避免破坏已完成 v7 基线），Office/Sales、Operator、独立 Reviewer 登录身份和短期租约，最长 15 分钟。一次仅开启特定必要的 QA Server+DB Gate，必要时经单独批准更改隔离 Preview；每次更新验证 requestId 幂等、错误 payload 拒绝、超时/断线恢复、物料 4 项、签样双人确认、当前版本升降级。失败或完成均即时关闭所有 Gate，比较完整回执和数据指纹，不清理历史审计。**不得自动正式开工**。

## 6. 完成/未完成标记

- `M1_CODE_AND_CONTRACT=AWAITING_EXACT_SHA_CI`（CI 通过后另记证据）。
- `MATERIAL_REAL_QA_WRITE_E2E=NOT_AUTHORIZED`。
- `IMAGE_BASELINE_MUTATION=DESIGN_ONLY`。
- `V8_PLUS_INDEPENDENT_VERSION_PROOF=NOT_INSTALLED`。
- `PRODUCTION_START=PROHIBITED`。
- 原 PR #263 四账号浏览器 PASS 仍仅限其原始 SHA/v7；不能转移到本轮新源码。
- Issue #160 `BLOCKED`，共享锁仍归 PR #202；`.github/workflows/**`、Supabase DB/RLS/Storage/Secrets、QA Gates、Vercel Preview 与生产环境不可变。
