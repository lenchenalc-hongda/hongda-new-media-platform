// ===== 节气/节日规则 =====
// 内置规则，不依赖第三方 API
// 预留外部数据源接口

export interface FestivalRule {
  name: string;
  date: string; // MM-DD
  type: 'festival' | 'solarterm' | 'event';
  industryAngles: string[];
  titleTemplates: string[];
  structureTemplate: string;
  riskNotes: string[];
}

const FESTIVAL_RULES: FestivalRule[] = [
  {
    name: '元旦',
    date: '01-01', type: 'festival',
    industryAngles: ['年终总结与展望', '印刷行业新年趋势', '新年开工计划'],
    titleTemplates: ['2026年，热转印行业的几个新趋势', '新年开工，宏达印业为您持续护航', '元旦特辑：印刷人的年终总结'],
    structureTemplate: '节日引题 → 行业回顾/展望 → 公司动作 → 客户祝福 → CTA引导',
    riskNotes: ['避免过度承诺新年目标', '行业趋势数据需注明来源'],
  },
  {
    name: '春节',
    date: '01-29', type: 'festival',
    industryAngles: ['春节前赶工期安排', '春节后开工通知', '印刷行业春节案例', '新春祝福'],
    titleTemplates: ['春节不打烊？宏达印业春节安排来了', '开工大吉｜宏达印业新春第一单', '春节案例特辑：那些年前赶出来的急单'],
    structureTemplate: '春节氛围 → 公司春节安排 → 年前案例回顾 → 开工通知 → 祝福',
    riskNotes: ['交期承诺需谨慎', '不要承诺春节期间正常生产'],
  },
  {
    name: '元宵节',
    date: '02-12', type: 'festival',
    industryAngles: ['元宵节营销案例', '节后复工状态'],
    titleTemplates: ['元宵节快乐｜宏达印业全面复工', '节后第一周，我们的生产状态是这样的'],
    structureTemplate: '节日问候 → 复工情况 → 近期案例展示 → CTA引导',
    riskNotes: [],
  },
  {
    name: '立春',
    date: '02-04', type: 'solarterm',
    industryAngles: ['一年之计在于春', '春季印刷趋势'],
    titleTemplates: ['立春｜一年之计在于春，印刷计划做好了吗？', '春季热转印趋势：这些材质开始流行'],
    structureTemplate: '节气引入 → 季节相关工艺建议 → 实用tips → CTA',
    riskNotes: ['趋势类内容需基于实际案例'],
  },
  {
    name: '清明',
    date: '04-04', type: 'solarterm',
    industryAngles: ['节气与生产节奏', '春夏季工艺注意事项'],
    titleTemplates: ['清明｜春夏交替，热转印工艺要注意什么', '清明时节，这些材质的转印效果最好'],
    structureTemplate: '节气引入 → 季节工艺变化 → 客户常见问题 → CTA',
    riskNotes: [],
  },
  {
    name: '五一劳动节',
    date: '05-01', type: 'festival',
    industryAngles: ['劳动者故事', '印刷工人风采', '品质坚守'],
    titleTemplates: ['五一特辑｜每一张花膜背后，都是印刷人的坚守', '致敬劳动者：宏达印业的20年品质之路'],
    structureTemplate: '节日主题 → 人物故事/车间故事 → 品质理念 → 社会价值 → CTA',
    riskNotes: ['人物故事需取得当事人同意'],
  },
  {
    name: '端午',
    date: '05-31', type: 'festival',
    industryAngles: ['端午节礼盒包装', '传统文化与印刷'],
    titleTemplates: ['端午礼盒热转印方案，让包装更有质感', '端午节｜传统节日与热转印的完美结合'],
    structureTemplate: '节日氛围 → 相关案例展示 → 工艺优势 → CTA',
    riskNotes: [],
  },
  {
    name: '618/年中',
    date: '06-18', type: 'event',
    industryAngles: ['年中总结', '下半年趋势', '电商包装热转印'],
    titleTemplates: ['618年中回顾｜热转印行业的半年度报告', '下半年印刷趋势：这些工艺值得关注'],
    structureTemplate: '年中回顾 → 数据/案例 → 下半年计划 → CTA',
    riskNotes: ['数据需真实可溯'],
  },
  {
    name: '中秋',
    date: '09-15', type: 'festival',
    industryAngles: ['中秋礼盒包装', '团圆主题'],
    titleTemplates: ['中秋礼盒定制，热转印让品牌更有温度', '月圆人团圆｜宏达印业祝您中秋快乐'],
    structureTemplate: '节日氛围 → 礼盒案例展示 → 工艺细节 → 祝福 → CTA',
    riskNotes: [],
  },
  {
    name: '国庆节',
    date: '10-01', type: 'festival',
    industryAngles: ['国庆假期安排', '爱国主题'],
    titleTemplates: ['国庆｜宏达印业放假安排及备货提醒', '国庆特辑：中国制造的热转印之路'],
    structureTemplate: '节日问候 → 放假通知 → 备货提醒 → CTA',
    riskNotes: [],
  },
  {
    name: '双十一',
    date: '11-11', type: 'event',
    industryAngles: ['电商包装', '年底备货'],
    titleTemplates: ['双十一备货指南｜热转印包装方案推荐', '年底旺季来了，热转印备货要注意什么'],
    structureTemplate: '电商旺季引入 → 包装方案 → 备货建议 → CTA',
    riskNotes: ['不承诺具体库存和交期'],
  },
  {
    name: '冬至',
    date: '12-21', type: 'solarterm',
    industryAngles: ['年终总结', '来年规划'],
    titleTemplates: ['冬至｜一年将尽，宏达印业的年度关键词', '冬至时节，盘一盘热转印行业的2026'],
    structureTemplate: '节气引入 → 年度回顾 → 来年展望 → CTA',
    riskNotes: [],
  },
];

export function getFestivalRules(): FestivalRule[] {
  return FESTIVAL_RULES;
}

export function getFestivalForDate(month: number, day: number): FestivalRule | undefined {
  const dateStr = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return FESTIVAL_RULES.find(f => f.date === dateStr);
}

export function getFestivalsInMonth(month: number): FestivalRule[] {
  return FESTIVAL_RULES.filter(f => f.date.startsWith(`${String(month).padStart(2, '0')}-`));
}
