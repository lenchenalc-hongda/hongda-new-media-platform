# Phase 5 非生产持久化与图片上传基础

## 1. 范围与边界

本切片实现 WOS Phase 5 离线执行之后的第一个持久化设计草案：

- 新增仓库内、可审阅但未执行的 SQL migration。
- 新增纯 TypeScript 持久化与项目投影契约。
- 新增确定性 contract tests，并通过 WOS 测试聚合器执行。
- 定义办公室提交事实、车间 inbox 投影和图片版本追加规则。

本切片没有连接或修改 Supabase、Storage、RLS、Production 数据、env 或 secrets，
没有新增 API route、UI 或 service-role 调用，也没有创建/切换 bucket。SQL 文件只是
repository draft；应用它仍需独立的 exact-SHA Human Gate。

测试只证明 TypeScript 契约和静态 SQL 文本满足本切片约束，不代表真实部署后的
权限、RLS、Storage policy 或跨组织访问已经得到运行时验证。

## 2. 两个独立入口

`PRODUCTION_ORDER` 与 `SAMPLING_REQUEST` 继续使用各自源表和提交账本：

- `wos_production_orders` / `wos_production_order_submissions`
- `wos_sampling_requests` / `wos_sampling_request_submissions`

不把两类记录合并成通用业务主表。统一 inbox 只是只读 projection。生产单的项目
负责人使用 `project_owner_profile_id`，打样申请使用
`product_owner_profile_id`；两者都引用 `profiles.id`，并在写入时核对组织。

## 3. 办公室提交事实

`wos_office_readiness_evidence` 保存不可变的办公室齐套证据。证据固定：

- 组织、入口类型、源记录 ID；
- 源记录版本序号与版本标签；
- 确认人与确认时间；
- 结构化证据快照；
- `immutable = true`。

每张提交表保存 office submission 的不可变事实：

- 精确源记录与组织；
- 提交时源记录版本；
- 当前项目负责人 `profiles.id`；
- 提交人；
- 齐套证据 ID；
- 组织和提交键范围内的 idempotency key；
- 显式提交时间。

唯一约束保证同一组织内 `submission_key` 只能对应一份业务提交，也保证同一源记录
版本不能由不同提交键重复写入。修改源记录后再次提交必须追加新版本，旧提交事实
保留，不更新、不删除。触发器拒绝提交、齐套证据和审计事实的 UPDATE/DELETE。

纯契约中的 `persistOfficeSubmission(...)` 同样要求：

- 源记录当前状态为 `SUBMITTED`；
- 提交版本、版本标签、组织、项目和负责人仍与源记录一致；
- 提交人、负责人和齐套确认人属于同组织、为有效档案，角色是
  `admin` / `manager` / `sales`；
- 齐套证据不可变，并绑定完全相同的源记录版本；
- 相同 idempotency key 与相同业务内容返回原事实，不重复写入；
- 相同 key 对应不同业务内容、或同一源版本使用另一个 key，均失败关闭。

## 4. 车间 inbox projection

`public.wos_workshop_inbox` 使用 `security_invoker = true` 的只读 view：

1. 分别连接生产单提交账本和打样申请提交账本。
2. 只有源记录仍为 `SUBMITTED` 时才产生任务。
3. 源记录组织、ID、版本序号、版本标签和负责人必须与提交事实完全一致。
4. 齐套证据必须属于相同组织、源记录和版本，且仍为不可变。
5. 当前项目负责人必须是对应 `profiles.id` 的有效档案。
6. `task_key` 为 `<ENTITY_TYPE>:<source_id>`，每类当前源记录最多一行。

因此，一个办公室已提交记录只会投影为一个车间任务。源版本推进后，旧提交事实仍
保留用于审计，但旧版本不再匹配投影条件；新版本需要追加提交事实。纯契约的
`buildWorkshopInbox(...)` 会重新核对事实，并在出现两个当前任务时整组失败关闭，
不任意挑选其中一条。

## 5. 图片版本与私有对象键

正式图片 bucket 固定为私有 `wos-private`。对象键由服务端确定性构造：

```text
organizations/<organization_id>/wos/<entity>/<source_id>/<category>/v<revision>/
  <attempt-or-no-attempt>/<image_id>/<safe_file_name>
```

`SAMPLING_RESULT` 的 `<attempt-or-no-attempt>` 必须是
`attempt/<technical_attempt_id>`；其他类别固定为 `no-attempt`。校验要求：

- 对象键中的组织、入口类型、源记录、类别、版本、图片 ID 与 metadata 完全一致；
- bucket 是 `wos-private`；
- 路径不是绝对路径，不含 `..`、反斜杠、query 或 fragment；
- 文件名为受限安全字符，MIME 只接受 JPEG/PNG/WebP，单图不超过 20 MiB；
- 上传人属于图片组织和源记录组织。

图片版本只追加。新图片可设置 `supersedes_image_id` 指向同组织、同入口、同源记录、
同类别且较旧的 READY 图片。替代行动产生单独的
`wos_reference_image_supersessions` 事实，原图片行保持不变。一个旧图片最多由一个
新图片显式替代；`wos_current_reference_image_versions` 根据 supersession 事实派生
有效状态，不通过覆盖 metadata 改变历史。

打样结果图必须引用已存在的 `wos_sampling_technical_records.id`，并且该 attempt
属于相同组织与精确 `sampling_request_id`。缺少 attempt、attempt 不一致，或非结果图
错误绑定 attempt，都会失败关闭。

## 6. 审计与组织隔离

`wos_persistence_audit_events` 预留以下不可变事件：

- `OFFICE_RECORD_SUBMITTED`
- `IMAGE_VERSION_APPENDED`
- `IMAGE_VERSION_SUPERSEDED`

新表启用 RLS，撤销 `PUBLIC`、`anon` 和 `authenticated` 的直接写入，只提供同组织
有效档案的 SELECT policy。图片版本、提交事实、齐套证据、supersession、状态历史和
技术尝试均安装 UPDATE/DELETE 拒绝触发器。后续写入必须通过单独审阅的 server RPC
或 service action 接线；本任务不创建该入口。

这些 SQL policy 和 trigger 尚未应用或运行态验证。部署前必须单独检查：

- authenticated、anon 和跨组织读写拒绝；
- private bucket 与 signed URL 有效期；
- 提交、图片和 supersession 的事务原子性；
- 并发 idempotency、stale version 与 trigger 行为；
- 备份、回滚和 Production Human Gate。

## 7. 确定性合同测试

`tests/unit/workshop-order-nonproduction-persistence.test.ts` 覆盖：

- 生产单与打样申请独立提交，且各自只产生一个 inbox task；
- 相同幂等键安全重放；冲突内容、重复版本和错误 key 失败；
- 旧源版本不进入 inbox，但旧提交事实继续保留；
- 缺齐套证据、证据版本不一致、错误负责人、停用/异组织档案和未提交源记录失败；
- 最新版本投影仍携带正确组织、源 ID、版本和 `profiles.id`；
- PRODUCT、FILM_PATTERN、CUSTOMER_APPROVED_SAMPLE、SIGNED_SAMPLE 和
  SAMPLING_RESULT 图片对象键；
- 图片重复 ID、错误组织对象键、路径穿越、错误上传人、非就绪图片和 stale version 失败；
- 打样结果图缺少 attempt、attempt ID 不一致失败；
- 新图片追加并显式 supersede 旧图片，历史 metadata 不被覆盖；
- 相同输入重复计算得到相同 inbox 结果；
- SQL 保留 repository-draft 标记、RLS、immutable trigger、独立提交表和 projection。

这些测试是 contract evidence，不是部署后的 permission assurance。

## 8. 后续任务

后续需要独立 bounded task 处理：

- 非 Production 环境中应用 migration 的前置审查；
- 受控 submission / image metadata server action 或 RPC；
- Storage private bucket 与对象上传接线；
- 实际登录角色、跨组织、并发和回滚运行态验收；
- 任何 Production SQL/RLS/Storage/env 或真实 Meta/WhatsApp cutover 的 Human Gate。
