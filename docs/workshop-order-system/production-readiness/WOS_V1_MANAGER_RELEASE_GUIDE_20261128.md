# WOS V1 Manager 放行指引

适用页面：`https://www.hongdaprinting.tech/workshop-orders/inbox`

## 放行前核对

1. 使用独立 Admin/Manager 账号登录。
2. 打开订单并确认状态为 `READINESS_CHECK`。
3. 核对当前订单编号、版本和四张 READY 图片。
4. 确认只有一个 CURRENT Baseline，且 Office 与 Workshop 签认人不同。
5. 确认四类物料均为最终确认状态，数量缺口已解决。

## 人工放行

1. 填写独立核对说明。
2. 点击“人工放行至 READY_TO_START”。
3. 以页面成功回执为准，确认状态变为 `READY_TO_START`。
4. 确认 `productionStarted=false`、`canStart=false`。
5. 放行不等于实际开机；实际开工必须走线下生产授权。

## 常见异常

- 签认人相同：拒绝放行，交由不同员工重新签认。
- 旧版本或旧图片：拒绝放行，退回 Office/Workshop 重做当前版本。
- Proof 过期：先重新核验当前四图，再核对稳定性摘要是否保持不变。
- 物料不齐：保持 `WAITING_MATERIAL`，不得提前放行。
- 重放或版本冲突：刷新订单，以数据库最新回执为准。
- 跨组织或 Viewer：系统应拒绝；不要通过手工改角色绕过。
