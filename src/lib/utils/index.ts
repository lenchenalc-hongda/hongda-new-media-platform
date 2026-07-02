export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(date: string | Date | null): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString('zh-CN');
}

export function formatPercent(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0%';
  return `${(num * 100).toFixed(1)}%`;
}

export function truncate(str: string | null | undefined, maxLength: number = 50): string {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
}

export function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    active: 'badge-green', paused: 'badge-yellow', archived: 'badge-gray',
    draft: 'badge-gray', approved: 'badge-blue', published: 'badge-green',
    in_production: 'badge-yellow', reviewed: 'badge-purple',
    new: 'badge-blue', contacted: 'badge-yellow', qualified: 'badge-green',
    negotiating: 'badge-purple', converted: 'badge-green', lost: 'badge-red', closed: 'badge-gray',
    urgent: 'badge-red', high: 'badge-red', medium: 'badge-yellow', low: 'badge-gray',
    planned: 'badge-gray', filming: 'badge-yellow', editing: 'badge-purple',
    // Script statuses
    pending_generate: 'badge-gray', pending_review: 'badge-yellow',
    review_rejected: 'badge-red', pending_filming: 'badge-blue',
    pending_publish: 'badge-purple', pending_post_review: 'badge-yellow',
    templated: 'badge-green', used: 'badge-green', revised: 'badge-yellow',
  };
  return map[status] || 'badge-gray';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: '启用', paused: '暂停', archived: '归档',
    draft: '草稿', approved: '已审核', published: '已发布',
    in_production: '制作中', reviewed: '已复盘',
    new: '新线索', contacted: '已联系', qualified: '已确认',
    negotiating: '谈判中', converted: '已成交', lost: '已丢失', closed: '已关闭',
    urgent: '紧急', high: '高', medium: '中', low: '低',
    filming: '拍摄中', editing: '剪辑中', planned: '待发布',
    // Script statuses
    pending_generate: '待生成', pending_review: '待审核',
    review_rejected: '审核退回', pending_filming: '待拍摄',
    pending_publish: '待发布', pending_post_review: '待复盘',
    templated: '已沉淀为模板', used: '已使用', revised: '已修改',
  };
  return labels[status] || status;
}

export function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = { weixin: '视频号', douyin: '抖音', other: '其他' };
  return labels[platform] || platform;
}

export function getContentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    product: '产品展示', process: '工艺讲解', case: '案例分析',
    qa: '问答解惑', factory: '工厂实拍', industry: '行业观点',
    tutorial: '教程指南', other: '其他',
    '工艺科普': '工艺科普', '客户避坑': '客户避坑', '客户问答': '客户问答',
    '案例拆解': '案例拆解', '老板经验': '老板经验', '工厂实拍': '工厂实拍',
    '设备展示': '设备展示', '材料判断': '材料判断', '成本效率': '成本效率',
    '评论区答疑': '评论区答疑', '爆款改编': '爆款改编', '销售反馈': '销售反馈',
  };
  return labels[type] || type;
}

export function getRequirementTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    huamo: '花膜', processing: '加工', equipment: '设备',
    process_consult: '工艺咨询', unclear: '不明确',
  };
  return labels[type] || type;
}

export function getLeadGradeLabel(grade: string): string {
  const labels: Record<string, string> = { A: 'A-高价值', B: 'B-中价值', C: 'C-待观察', D: 'D-低价值' };
  return labels[grade] || grade;
}

export function getKnowledgeCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    company: '公司介绍', process: '工艺知识', material: '材料适配',
    equipment: '产品设备', faq: '客户FAQ', persona: '人设指南',
    viral: '爆款拆解', review: '复盘案例', sales: '线索话术', risk: '风险规则',
    '公司介绍': '公司介绍', '账号人设': '账号人设', '工艺知识': '工艺知识',
    '材料适配': '材料适配', '产品设备': '产品设备', '客户FAQ': '客户FAQ',
    '私信话术': '私信话术', '评论区话术': '评论区话术', '案例故事': '案例故事',
    '客户痛点': '客户痛点', '销售反馈': '销售反馈', '外贸客户问题': '外贸客户问题',
    '爆款参考': '爆款参考', '脚本模板': '脚本模板', '拍摄素材': '拍摄素材',
    '风险禁忌': '风险禁忌', '流程SOP': '流程SOP', '复盘沉淀': '复盘沉淀',
    '内部培训': '内部培训',
  };
  return labels[cat] || cat;
}

export function getScriptSourceLabel(source: string | null | undefined): string {
  if (!source) return '-';
  const labels: Record<string, string> = {
    from_topic: '选题库', from_customer: '客户问题', from_teardown: '爆款拆解',
    from_knowledge: '知识库', from_history: '历史高表现', manual: '手动输入',
  };
  return labels[source] || source;
}
export function getTopicSourceLabel(source: string): string {
  return source || '-';
}

export function getPriorityLabel(priority: string): string {
  return priority || '-';
}

export function getScriptStatusLabel(status: string): string {
  return status || '-';
}

export function getPlatformLabelForTopic(platform: string): string {
  return platform || '-';
}

export function getContentScopeLabel(scope: string): string {
  return scope || '-';
}

export function getKnowledgeStatusLabel(status: string): string {
  return status || '-';
}

export function getKnowledgeCardTypeLabel(type: string): string {
  return type || '-';
}
