// ===== CSV Import/Export Utilities =====

export interface CsvFieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'enum';
  enumValues?: string[];
  description?: string;
}

export interface CsvImportResult {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: { row: number; field: string; message: string }[];
  preview: Record<string, string>[];
}

export type CsvEntity = 'accounts' | 'topics' | 'posts' | 'leads' | 'knowledge';

// ===== Field Definitions =====
export const CSV_FIELD_DEFS: Record<CsvEntity, CsvFieldDef[]> = {
  accounts: [
    { key: 'name', label: '账号名称', required: true },
    { key: 'platform', label: '平台', required: true, enumValues: ['weixin', 'douyin', 'other'] },
    { key: 'persona', label: '人设' },
    { key: 'positioning', label: '定位' },
    { key: 'target_audience', label: '目标客户' },
    { key: 'content_style', label: '内容风格' },
    { key: 'conversion_goal', label: '转化目标' },
    { key: 'status', label: '状态', enumValues: ['active', 'paused', 'archived'] },
  ],
  topics: [
    { key: 'title', label: '选题标题', required: true },
    { key: 'account_id', label: '所属账号ID', required: true },
    { key: 'content_type', label: '内容类型', enumValues: ['工艺科普', '客户避坑', '客户问答', '案例拆解', '老板经验', '工厂实拍', '设备展示', '材料判断', '成本效率', '评论区答疑', '爆款改编', '销售反馈'] },
    { key: 'platform', label: '平台', enumValues: ['视频号', '抖音', '两者都适合'] },
    { key: 'topic_source', label: '选题来源', enumValues: ['客户私信', '评论区问题', '销售反馈', '爆款拆解', '知识库', '历史高表现视频', '老板经验', '平台热点', '展会客户问题', '外贸客户问题', '手动新增'] },
    { key: 'target_customer', label: '目标客户' },
    { key: 'customer_pain', label: '客户痛点' },
    { key: 'product_process', label: '产品/工艺' },
    { key: 'conversion_goal', label: '转化目标' },
    { key: 'priority', label: '优先级', enumValues: ['紧急', '高', '中', '低'] },
    { key: 'status', label: '状态', enumValues: ['待策划', '待转脚本', '脚本中', '待审核', '已审核', '待拍摄', '已发布', '待复盘', '已沉淀', '暂停'] },
  ],
  posts: [
    { key: 'title', label: '视频标题', required: true },
    { key: 'account_id', label: '所属账号ID', required: true },
    { key: 'platform', label: '平台', enumValues: ['weixin', 'douyin', 'other'] },
    { key: 'publish_date', label: '发布时间' },
    { key: 'post_url', label: '视频链接' },
    { key: 'content_type', label: '内容类型' },
    { key: 'status', label: '状态', enumValues: ['planned', 'filming', 'editing', 'published', 'reviewed'] },
    { key: 'notes', label: '备注' },
  ],
  leads: [
    { key: 'customer_name', label: '客户名称', required: true },
    { key: 'source_platform', label: '来源平台', enumValues: ['weixin', 'douyin', 'other'] },
    { key: 'source_account_id', label: '来源账号ID' },
    { key: 'company', label: '公司名称' },
    { key: 'wechat', label: '微信' },
    { key: 'phone', label: '电话' },
    { key: 'product', label: '产品需求' },
    { key: 'material', label: '材质' },
    { key: 'quantity', label: '数量', type: 'number' },
    { key: 'requirement_type', label: '需求类型', enumValues: ['花膜', '加工', '设备', '工艺咨询', '不明确'] },
    { key: 'grade', label: '线索等级', enumValues: ['A', 'B', 'C', 'D'] },
    { key: 'status', label: '状态', enumValues: ['new', 'contacted', 'qualified', 'negotiating', 'converted', 'lost', 'closed'] },
  ],
  knowledge: [
    { key: 'title', label: '知识卡标题', required: true },
    { key: 'category', label: '分类', enumValues: ['公司介绍', '工艺知识', '材料适配', '产品设备', '客户FAQ', '私信话术', '案例故事', '风险禁忌', '脚本模板', '复盘沉淀'] },
    { key: 'card_type', label: '卡类型' },
    { key: 'core_conclusion', label: '核心结论' },
    { key: 'summary', label: '简介' },
    { key: 'content_scope', label: '可用范围', enumValues: ['可对外', '可模糊对外', '仅内部参考', '禁止对外'] },
    { key: 'knowledge_status', label: '状态', enumValues: ['草稿', '待审核', '已确认', '需更新', '已过期', '停用'] },
    { key: 'applicable_accounts', label: '适用账号ID（逗号分隔）' },
  ],
};

// ===== Field key → label map =====
export function getFieldLabel(entity: CsvEntity, key: string): string {
  const def = CSV_FIELD_DEFS[entity]?.find(f => f.key === key);
  return def?.label || key;
}

// ===== Validate a single row =====
export function validateRow(entity: CsvEntity, row: Record<string, string>, rowIndex: number): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const defs = CSV_FIELD_DEFS[entity];
  if (!defs) return errors;

  for (const def of defs) {
    const value = (row[def.key] || '').trim();

    // Required check
    if (def.required && !value) {
      errors.push({ field: def.key, message: `"${def.label}" 是必填字段` });
      continue;
    }

    if (!value) continue;

    // Enum check
    if (def.enumValues && def.enumValues.length > 0) {
      if (!def.enumValues.includes(value)) {
        errors.push({ field: def.key, message: `"${value}" 不是有效的 ${def.label} 值，可选：${def.enumValues.join('、')}` });
      }
    }

    // Number check
    if (def.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push({ field: def.key, message: `"${value}" 不是有效数字` });
      }
    }
  }

  return errors;
}

// ===== Parse CSV text =====
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; errors: string[] } {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const errors: string[] = [];

  if (lines.length < 2) {
    return { headers: [], rows: [], errors: ['CSV 文件需要至少包含表头行和一行数据'] };
  }

  // Parse headers (first line)
  const headers = parseCsvLine(lines[0]);
  if (headers.length === 0) {
    return { headers: [], rows: [], errors: ['无法解析表头行'] };
  }

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) {
      errors.push(`第 ${i + 1} 行：空行，已跳过`);
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return { headers, rows, errors };
}

// ===== Parse a single CSV line (handles quoted fields) =====
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ===== Generate CSV from data =====
export function generateCsv(headers: string[], rows: Record<string, string>[]): string {
  // Escape field for CSV
  const escape = (val: string): string => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  };

  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    const line = headers.map(h => escape(row[h] || '')).join(',');
    lines.push(line);
  }
  return lines.join('\n');
}

// ===== Download CSV =====
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== Download template =====
export function downloadTemplate(entity: CsvEntity): void {
  const defs = CSV_FIELD_DEFS[entity];
  if (!defs) return;
  const headers = defs.map(d => d.label);
  const examples: Record<string, string> = {};
  defs.forEach(d => {
    if (d.key === 'title') examples[d.label] = '示例标题';
    else if (d.key === 'name') examples[d.label] = '示例账号';
    else if (d.key === 'customer_name') examples[d.label] = '张三';
    else if (d.required) examples[d.label] = '必填';
    else if (d.enumValues) examples[d.label] = d.enumValues[0];
    else examples[d.label] = '';
  });
  const rows = [examples];
  const csv = generateCsv(headers, rows);
  downloadCsv(csv, `${entity}_导入模板.csv`);
}

// ===== Import CSV to localStorage =====
export function importCsvToStorage<T extends { id: string }>(
  entity: CsvEntity,
  sourceHeaders: string[],
  rows: Record<string, string>[],
  storageKey: string,
  currentData: T[],
  idGenerator: () => string
): CsvImportResult {
  const result: CsvImportResult = { total: rows.length, created: 0, updated: 0, failed: 0, errors: [], preview: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors = validateRow(entity, row, i);

    if (rowErrors.length > 0) {
      rowErrors.forEach(e => result.errors.push({ row: i + 2, field: e.field, message: e.message }));
      result.failed++;
    } else {
      // Create a new item
      const item: any = { id: idGenerator() };
      const defs = CSV_FIELD_DEFS[entity];
      defs.forEach(def => {
        // Map from label back to key
        const sourceIdx = sourceHeaders.findIndex(h => h === def.label);
        if (sourceIdx >= 0) {
          const val = (row[def.label] || '').trim();
          if (val) {
            if (def.type === 'number') item[def.key] = Number(val);
            else item[def.key] = val;
          }
        } else if (row[def.key]) {
          item[def.key] = row[def.key].trim();
        }
      });
      item.created_at = new Date().toISOString();
      item.org_id = 'org_001';

      result.created++;
      result.preview.push(row as any);
    }
  }

  return result;
}
