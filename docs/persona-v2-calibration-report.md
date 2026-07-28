# 账号人设 V2 五账号校准报告

> 报告日期：2026-07-28
> 版本：V5.5

---

## 测试方法

8 个固定场景 × 5 个账号 = 40 个测试组合。
每个组合验证账号 Persona Compiler 身份合约、风格合约、品牌合约和任务指令的差异性。

## 校准结果摘要

### 五个账号身份差异性

| 账号 | speaker_role | 出镜身份 | 核心信念 |
|---|---|---|---|
| 小陈 (a1) | sales | 热转印前端顾问 | 先了解客户需求才能给出靠谱建议 |
| 小林 (a2) | host | 热转印厂三代/经验解释者 | 经验是判断的底气 |
| 沐森兄 (a3) | technician | 热转印一线工艺师傅 | 做热转印就是做细节 |
| 许总 (a4) | owner | 宏达印业负责人、工厂经营者 | 买设备不是买参数，是买稳定生产的能力 |
| 妮妮 (a5) | consultant | 00后热转印女孩 | 讲清楚比讲深更重要 |

### 跨账号 Prompt 差异性

同一场景（设备稳定性）下，五个账号的 `prompt_text` 各不相同：
- 许总和妮妮的完整 Prompt 不同 ✅
- 许总和沐森兄的身份、专业边界和表达要求不同 ✅
- 五个账号的出镜身份全部不同 ✅
- 五个账号的 voice_traits 全部不同 ✅

### 许总 Review 测试

| 测试脚本 | 预期 | 结果 |
|---|---|---|
| 宏达自主研发生产 | 违规 | ✅ 判定违规 |
| 视觉定位百分之百准确 | 违规 | ✅ 判定违规 |
| 买回去三个月一定回本 | 违规 | ✅ 判定违规 |
| 一定可以减少三名工人 | 违规 | ✅ 判定违规 |
| 其他品牌机器都不稳定 | 违规 | ✅ 判定违规 |
| 宏达目前主推的UV方案 | 通过 | ✅ 判定通过 |
| 宏达负责交付和本地服务 | 通过 | ✅ 判定通过 |
| 客户可以先拿产品来测试 | 通过 | ✅ 判定通过 |

### 关系披露测试

场景8（品牌关系敏感问题）触发 disclosure_required=true ✅
场景1-7 不触发非必要的 disclosure ✅

## 账号内容精调建议

### 许总

当前配置已覆盖主要品牌边界，建议后续关注：
1. 内容比例：设备细节与稳定性 25% > 产品应用与工艺判断 20% > 宏达售前交付售后 20%
2. 避免每条都以"先打样"结尾
3. 需要更多设备细节而非空泛的"宏达经验"

### 其他账号

暂无重大偏差，实测后按运营数据持续微调。

## 测试总数

| 测试文件 | 用例数 |
|---|---|
| `tests/unit/account-v2.test.ts` | 22 |
| `tests/unit/persona-compiler.test.ts` | 24 |
| `tests/integration/route-persona.test.ts` | 22 |
| `tests/integration/route-handler-persona.test.ts` | 22 |
| `tests/fixtures/calibration.test.ts` | 30+ |

## 评分体系

每条脚本输出以下 10 项 10 分制评分：
1. persona_fit — 是否符合人设
2. audience_relevance — 是否匹配目标客户
3. naturalness — 表达是否自然
4. hook_strength — 钩子吸引力
5. information_value — 信息量
6. trust_building — 信任感
7. account_differentiation — 账号差异度（替换账号名后是否仍成立）
8. conversion_naturalness — 转化自然度
9. factual_safety — 事实安全
10. repetition_risk — 重复风险（倒扣分）

最低标准：persona_fit ≥ 8, account_differentiation ≥ 8, factual_safety ≥ 9
