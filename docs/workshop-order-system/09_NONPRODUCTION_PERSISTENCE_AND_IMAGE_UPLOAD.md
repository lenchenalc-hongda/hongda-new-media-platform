# Phase 5B 离线契约：非生产 WOS 持久化与图片元数据

## 1. 明确边界

本 PR 只交付 Phase 5B 离线契约：可审阅、可测试的纯 TypeScript 领域函数，以及
确定性 contract tests。它不是数据库持久化，不是已应用的 migration，不是经测试的 RLS 保证，也不是实时图片上传。

本 PR 不包含 `.sql` 或 migration 文件，不创建表、view、policy、grant、trigger 或
index，不连接 Supabase 或 Storage，不写 Production 数据，不修改 Production env 或
secrets，也没有新增 API route、UI、service-role 调用或真实对象上传。

原有草稿 SQL 与 master 上已有的 migration 版本冲突。该冲突文件已从本 PR 完全移除，
且没有创建重命名或替代 SQL 文件。任何数据库实现都必须在后续独立任务中重新设计、
审查并应用。

## 2. 两个独立业务入口

纯契约始终保留 `PRODUCTION_ORDER` 与 `SAMPLING_REQUEST` 两个独立入口。两者的提交
事实、版本、源记录和负责人不会被合并成通用业务主表；统一 workshop inbox 仅是离线
只读 projection。

- 生产单与打样申请分别提交；
- 每个 source 只允许产生一个当前 inbox task；
- 组织、入口类型和 source ID 必须完全一致；
- 旧版本提交事实保留用于审计，但不得继续投影为当前任务；
- 同一 source 出现多个当前候选任务时整体失败关闭。

## 3. 提交与幂等规则

`persistOfficeSubmission(...)` 只根据调用方提供的快照计算下一状态，不读取数据库，
也不产生副作用。它要求：

- source 当前状态为 `SUBMITTED`；
- submission 的组织、入口类型、source ID、revision 和 version label 与 source
  快照完全一致；
- 项目负责人引用 `profiles.id`，并与 source 快照中的负责人一致；
- 提交人、负责人和齐套确认人都属于当前组织且为有效档案；
- 齐套证据不可变，并绑定完全相同的 source 版本；
- 同一幂等键与相同业务内容返回原事实，不追加记录；
- 相同幂等键对应不同业务内容、重复 submission ID、重复版本或错误证据绑定均失败
  关闭。

新增提交记录和证据快照会被冻结；函数返回新的冻结数组，不覆盖已有历史。调用方传入
的既有事实只作为输入，纯契约不会就地修改它们。

## 4. Inbox projection

`buildWorkshopInbox(...)` 重新核对 source、profile、owner、版本和证据后才生成
task。输出顺序由 `submittedAt` 和 `taskKey` 确定，因此相同输入得到相同结果。

projection 不把数据库约束当作已验证前提。任何缺失、重复、跨组织、停用档案、
版本不一致或非 `SUBMITTED` source 都会返回 blocker，并阻止不安全事实进入当前
task 集合。

## 5. 图片版本类别

离线契约保留全部正式参考图片类别：

- `PRODUCT`
- `FILM_PATTERN`
- `CUSTOMER_APPROVED_SAMPLE`
- `SIGNED_SAMPLE`
- `SAMPLING_RESULT`
- `PACKAGING_LABEL`
- `DEFECT_RISK`
- `OTHER`

类别来自共享领域类型，并为每个类别生成确定性的 object-key 段。未知类别不能通过
runtime 校验。只有 `SAMPLING_RESULT` 可以绑定技术尝试；其他类别带技术尝试会失败
关闭。

## 6. 私有对象键与上传边界

契约只验证未来私有 bucket `wos-private` 的元数据和对象键，不创建 bucket，不生成
signed URL，也不执行上传。对象键形状为：

```text
organizations/<organization_id>/wos/<entity>/<source_id>/<category>/v<revision>/
  <attempt-or-no-attempt>/<image_id>/<safe_file_name>
```

组织、入口、source、类别、revision、image ID 和文件名必须与元数据一致。绝对路径、
`..`、反斜杠、query、fragment、不安全文件名、未批准 MIME 和超限文件大小均失败
关闭。上传人必须属于图片所在组织。

这只是 object-key contract evidence。真实私有访问控制、bucket policy、签名字段和
上传事务尚未实现或验证。

## 7. 打样结果与技术尝试

`SAMPLING_RESULT` 必须同时满足：

- 入口类型是 `SAMPLING_REQUEST`；
- 图片绑定一个非空技术尝试 ID；
- 技术尝试属于相同组织；
- 技术尝试的 `samplingRequestId` 精确等于图片 source ID；
- 技术尝试声明为不可变。

缺少尝试、尝试 ID 不同、跨组织、错误 sampling request 或把结果图绑到生产单都会
失败关闭。非结果图绑定技术尝试同样被拒绝。

## 8. 版本与替代历史

图片 metadata 只追加，不覆盖旧记录。替代行为产生独立的 supersession fact，并要求：

- 被替代图片存在，且组织、入口、source 和类别一致；
- 旧 revision 小于新 revision，版本标签不同；
- 同一旧图片不能被两个新图片重复替代；
- projection 对缺失、错 scope 或重复链接整体失败关闭，不任意选择“当前图片”。

这些规则目前只由纯函数和 tests 证明，不代表数据库 transaction、并发唯一性或
append-only trigger 已部署。

## 9. 测试证据

`tests/unit/workshop-order-nonproduction-persistence.test.ts` 覆盖两个入口、幂等、
组织与 `profiles.id` 隔离、不可变历史、全部八个图片类别、对象键隔离、错误上传人、
stale version、打样技术尝试精确绑定和 supersession。该测试由现有
`tests/unit/workshop-order-suite.test.ts` 聚合器执行。

Focused test 还明确断言冲突的
`20261027073000_workshop_order_system_nonproduction_persistence.sql` 不在 PR 中，
并禁止同名替代 migration。文档与测试不得把本切片描述成已完成的数据库或 Storage
功能。

## 10. 后续独立 SQL 任务

本 PR 之后需要创建 NEW、单独 scoped、reviewed 的非生产 SQL 任务，不能复用本 PR
的 allowlist。该任务至少需要：

1. 解决已存在的 migration version collision，并使用新的 reviewed version。
2. 设计并审查 `UNIQUE-VERSION migration`，包括独立提交账本、source-version
   唯一性、idempotency key 和图片 supersession 的并发约束。
3. 对 inherited INSERT/GRANT/policy 进行专门 remediation review，不能把历史权限
   债务隐藏在 WOS 任务中修复。
4. 在 disposable 非生产环境验证 RLS、跨组织拒绝、append-only trigger、事务原子性、
   回滚和备份。
5. 完成真实 private Storage policy 与上传路径验证。

该后续任务必须保持数据库实现与契约测试分离审查。任何 Production SQL/RLS/env/
Storage 或真实数据操作仍受强制 Production gate 约束，并要求明确 Human Gate。

## 11. 当前完成度

Phase 5B 的离线 TypeScript contract 和 focused tests 可审阅；数据库持久化、已应用
migration、运行态 RLS assurance、Storage bucket 和 live image upload 均未完成。
剩余数据库与 Storage hard gate 必须如实保留，不能以本离线切片替代。
