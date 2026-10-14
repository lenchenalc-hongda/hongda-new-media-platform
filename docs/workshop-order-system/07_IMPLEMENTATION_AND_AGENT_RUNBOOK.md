# 实施路线与自动 Agent Runbook V1

## 1. 总体原则

- 三个项目可注册：CPC、GLH、WOS。
- Mac 同时最多执行两个重任务；第三个项目自动排队。
- 每个项目一个控制 Issue、一条 active task、一个 active PR。
- WOS 使用 Issue #104、任务前缀 `WOS-`、分支前缀 `codex/wos-`。
- WOS 普通任务只允许修改项目自有路径。
- 共享导航、根 layout、package、CI、Agent Control 基础设施必须走独立 shared-path/infra 任务。

## 2. 模型策略

WOS 使用 `MODEL_POLICY_V1`：

- L1 新任务：`deepseek-v4-flash + high`
- L2 第一次 FIX_REQUIRED：默认模型 + `xhigh`
- L3 第二次 FIX_REQUIRED：强模型 + `xhigh`
- 达到最大修复轮次：STOP / PM diagnosis
- 新任务重新回到 L1

模型升级不改变 Human Gate。

## 3. Phase 路线

### Phase 0 — Spec Lock

目标：

- 锁定生产下单字段
- 锁定打烊申请字段
- 锁定状态机和 Gate
- 锁定角色与权限
- 锁定图片/版本防错
- 锁定数据模型
- 创建可执行 TypeScript 规格与单元测试

允许：文档、类型、纯函数、测试。

禁止：Production DB/RLS/data/env/secrets。

### Phase 1 — Foundation

- 非 Production migration 草案
- TypeScript domain types
- API schemas
- repository 层接口
- test fixtures
- RLS 设计文档和 contract test（不执行 Production）

### Phase 2 — Office Entry

- 生产下单页面
- 打烊申请页面
- 多图上传 UI（先接隔离/测试存储）
- 完整性校验
- 草稿/提交
- 我的申请

### Phase 3 — Workshop Inbox & Readiness

- 统一车间队列
- 花膜/夹具/来料/签样状态
- 图片版本核对
- 阻塞原因
- 接单/退回/补资料

### Phase 4 — Scheduling

- 日/周排期
- 机台维度
- 优先级和加急
- 容量冲突
- readiness Gate

### Phase 5 — Sampling Execution

- 技术参数
- attempt 版本
- PASS/FAIL/CANNOT_SAMPLE
- 结果图片
- 技术/项目负责人确认
- 转生产单草稿

### Phase 6 — Production Execution

- 待开工核对
- 视觉基准确认
- 三方确认
- 开工/暂停/恢复/完工
- 生产数量和异常记录

### Phase 7 — Notifications & Management

- 行动型通知
- 逾期与阻塞
- 车间负荷
- 打烊通过率
- 按期完成率
- 防错拦截记录

### Phase 8 — Non-Production Pilot

- 测试办公室用户
- 测试技术员/主管
- 测试图片和版本切换
- 测试物料齐套与排期
- 测试异常暂停
- 测试权限/RLS

### Phase 9 — Production Readiness Human Gate

- 冻结 release SHA
- 数据库/RLS/Storage migration 清单
- 备份与回滚
- 权限和图片私有访问证据
- Production env 清单（不暴露值）
- 上线窗口
- 明确 Owner approval

## 4. 自动任务生成规则

每个 Phase 拆成小任务，建议单任务：

- 1–8 个文件
- 一个明确目标
- 一个可验证输出
- 不同时触碰业务代码与 shared infra

示例：

- `WOS-P0-DOMAIN-SPEC-001`
- `WOS-P0-IMAGE-GATE-002`
- `WOS-P1-SCHEMA-DRAFT-001`
- `WOS-P2-PRODUCTION-FORM-001`
- `WOS-P2-SAMPLING-FORM-002`

## 5. 自动执行闭环

```text
Issue #104 READY_FOR_CODEX
  ↓
发布可信 AGENT_CONTROL_PROJECT_TASK_V1
  ↓
发布精确 AGENT_CONTROL_TRIGGER_V1
  ↓
gate / validate
  ↓
self-hosted Mac Runner
  ↓
Codex + DeepSeek 执行 bounded task
  ↓
固定检查 + 路径检查
  ↓
Agent Control Writer 创建/更新 PR
  ↓
PM exact-head review
  ├─ PASS + CI/Preview green → merge
  └─ FIX_REQUIRED → MODEL_POLICY 升级并继续同一 PR
  ↓
更新 Issue #104
  ↓
创建下一 bounded task
```

## 6. 自动恢复规则

以下属于技术故障，不消耗 fix_round：

- GitHub checkout timeout
- DNS/网络抖动
- Runner 离线
- Key 未加载
- pnpm registry 短暂失败
- CI 平台异常

自动任务应先重试/恢复，再决定是否通知老板。

以下属于代码修复，消耗 fix_round：

- TypeScript 编译失败
- contract test 失败
- Gate 实现不符合规格
- 越权路径修改
- 权限逻辑问题

## 7. Human Gate

永远不得自动执行：

- Production SQL/schema/RLS/data
- Production Storage bucket/policy
- Production env/secrets
- destructive migration
- 客户归属和财务 SoT
- 权限安全边界放宽
- 正式外部发布

Agent 只准备可审阅计划、migration、测试和回滚材料。

## 8. 自动推进完成条件

自动 Agent 在以下情况保持静默并继续：

- 普通代码实现
- CI 修复
- 测试补充
- PR review/fix
- merge 后下一任务接续

仅在以下情况通知：

- 真实业务决策
- Production Human Gate
- 无法自动恢复的 Runner/网络问题
- 重大里程碑
- 规格存在冲突或缺失

## 9. Phase 0 验收

- 两个独立入口的字段规格完整
- 状态机和 Gate 可执行
- 图片和版本防错规则完整
- 角色权限明确
- 数据模型明确
- TypeScript 规格和测试通过
- Agent Control WOS lane 可 gate/validate/execute
- 未执行任何 Production 变更
