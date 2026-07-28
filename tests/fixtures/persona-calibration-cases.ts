// ===== V5.5 Persona Calibration Fixtures =====
// 8 fixed test scenarios for 5-account calibration
export interface CalibrationScenario {
  id: string;
  name: string;
  productOrProcess: string;
  customerPain: string;
  material: string;
  platform: string;
  funnelStage: string;
}

export const CALIBRATION_SCENARIOS: CalibrationScenario[] = [
  {
    id: 's1',
    name: '设备稳定性',
    productOrProcess: '视觉定位UV打印机',
    customerPain: '客户担心打样很好，批量生产不稳定',
    material: '塑胶玩具件',
    platform: 'weixin',
    funnelStage: 'consideration',
  },
  {
    id: 's2',
    name: '工艺选择',
    productOrProcess: '塑胶玩具件印刷',
    customerPain: '不知道应该选择UV、热转印、丝印还是移印',
    material: '塑胶玩具件',
    platform: 'weixin',
    funnelStage: 'consideration',
  },
  {
    id: 's3',
    name: '设备投资',
    productOrProcess: 'UV打印机',
    customerPain: '订单不稳定，不知道现在应不应该买设备',
    material: '混合材质',
    platform: 'weixin',
    funnelStage: 'awareness',
  },
  {
    id: 's4',
    name: '售后问题',
    productOrProcess: 'UV打印设备',
    customerPain: '已有UV设备，但故障后原供应商响应慢',
    material: '塑胶',
    platform: 'weixin',
    funnelStage: 'customer_service',
  },
  {
    id: 's5',
    name: '产品打样与报价',
    productOrProcess: '热转印加工',
    customerPain: '客户只发了一张产品图片，就要求直接报价和承诺效果',
    material: 'PE瓶',
    platform: 'weixin',
    funnelStage: 'consideration',
  },
  {
    id: 's6',
    name: '人工定位',
    productOrProcess: '视觉定位UV打印机',
    customerPain: '产品款式多，人工摆放慢，希望使用视觉定位',
    material: '塑胶玩具件',
    platform: 'weixin',
    funnelStage: 'consideration',
  },
  {
    id: 's7',
    name: '真实项目复盘',
    productOrProcess: '热转印打样',
    customerPain: '样品通过，但连续生产时出现位置漂移和良率下降',
    material: 'PET瓶',
    platform: 'weixin',
    funnelStage: 'high_intent',
  },
  {
    id: 's8',
    name: '品牌关系敏感问题',
    productOrProcess: 'UV打印设备',
    customerPain: '这台机器是不是宏达自己生产的？宏达和设备厂家是什么关系？',
    material: '塑胶',
    platform: 'weixin',
    funnelStage: 'consideration',
  },
];

export interface CalibrationScore {
  persona_fit: number;
  audience_relevance: number;
  naturalness: number;
  hook_strength: number;
  information_value: number;
  trust_building: number;
  account_differentiation: number;
  conversion_naturalness: number;
  factual_safety: number;
  repetition_risk: number;
}
