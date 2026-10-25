# CPC 客户名称乱码修复｜生产数据核验与导入防护

## 已查明的事实（2026-10-25，只读）
- Production 数据库 `cpc_customer_references` 152 条 canonical 客户引用中，有 3 条 `display_name_snapshot` 包含 Unicode 替换字符 U+FFFD：C091、C093、C140。
- 2026-10-18 导入审计 `IMPORT_CANONICAL_REFERENCES` 的 `metadata.source_file` 为 `宏达印务客户池客户名单_20261018.docx`，`source_name_encoding_issues` 已明确列出这 3 个客户 ID。
- 已找回当时导入的 DOCX；它同样含乱码，不能再作为恢复原名的可靠来源。
- CPC 不是客户名称与客户归属权威源，不能凭似是而非的名称替换客户档案。

## 不经猜测的恢复步骤
1. 按稳定外部客户 ID 查询真正的车间客户池 `customers` 数据。若源头已损坏，核对可靠合同、报价、客户盖章文件或权威登记证据，确认公司全称。不要只凭乱码残片推测。
2. 每条修复记录应包括：`external_source`、`external_customer_id`、`old_display_name_snapshot`、`corrected_display_name_snapshot`、证据来源、审核人、审核时间。
3. 如果源头本身也乱码，应由车间系统的数据所有者按独立授权先修复源头，防止下一次同步覆盖正确快照。
4. Production CPC 只读核验、备份及独立审批完成后，按精确 ID + 原值做受控更新，并保留审计证据；不得改变 `external_owner_reference`、项目/任务关联、财务数据或其它记录。
5. 修复后再查询乱码计数、客户稳定 ID、人员归属和关联数，并以真实登录态在客户列表/详情和报价选择器验证。

## 未来客户池导入预检
只读命令：

`node node_modules/tsx/dist/cli.mjs scripts/customer-project-center/validate-customer-import.ts /absolute/path/shared-data.json`

支持 JSON 数组、`{customers:[...]}`、`{rows:[...]}`，识别 `customerName`、`displayNameSnapshot` 和 `display_name_snapshot`。拒绝空名及 U+FFFD，报错只显示问题行号与数量，不输出业务数据。非零退出码须阻断人工导入流程。

该预检脚本不会自动阻止绕过它的直接 SQL 导入；后续可在所有旧数据修复、测试库验证、Production 数据库迁移单独审批后，再讨论数据库级的保护约束。

## 代码改动范围
- 新增纯函数检出损坏名称。
- 新增只读 JSON 预检 CLI 和单元测试。
- 新建临时客户 API 拒绝 U+FFFD，原有损坏客户保持可见。
- 不操作 Production SQL/RLS、正式客户、客户归属、财务、Vercel 环境或部署。
