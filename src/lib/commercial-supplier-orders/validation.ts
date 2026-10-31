/**
 * Supplier production orders use thousandths of a yuan, matching commercial quotations.
 * Integer/BigInt arithmetic prevents binary floating-point drift when saving versions.
 */
export interface SupplierOrderLine {
  id: number;
  category: string;
  name: string;
  spec: string;
  unit: string;
  quantity: string;
  price: string;
  note: string;
}
export interface SupplierOrderPayload {
  order: Record<string, string>;
  lines: SupplierOrderLine[];
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^\d{1,12}(?:\.\d{1,3})?$/;
const MAX_SAFE_MILLI = BigInt(Number.MAX_SAFE_INTEGER);

export function toThousandths(text: string): bigint | null {
  if (!DECIMAL.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * BigInt(1000) + BigInt((fraction + '000').slice(0, 3));
}

export function lineAmountThousandths(quantity: string, price: string): bigint | null {
  const q = toThousandths(quantity);
  const p = toThousandths(price);
  if (q === null || p === null || q <= BigInt(0)) return null;
  return (q * p + BigInt(500)) / BigInt(1000); // HALF_UP to 0.001 yuan, per line
}

export function formatSupplierMoney(thousandths: number): string {
  return (thousandths / 1000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export type SupplierOrderValidation =
  | { ok: true; snapshot: SupplierOrderPayload; amountThousandths: number }
  | { ok: false; message: string };

export function validateSupplierOrder(snapshot: unknown): SupplierOrderValidation {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, message: '布产单内容无效' };
  }
  let serialized = '';
  try { serialized = JSON.stringify(snapshot); } catch { return { ok: false, message: '布产单内容无效' }; }
  if (serialized.length > 80000) return { ok: false, message: '单据内容超过容量限制' };
  const object = snapshot as Record<string, unknown>;
  if (!object.order || typeof object.order !== 'object' || Array.isArray(object.order) ||
      !Array.isArray(object.lines) || object.lines.length < 1 || object.lines.length > 100) {
    return { ok: false, message: '请输入至少一项生产明细（最多100项）' };
  }
  const order = object.order as Record<string, unknown>;
  if (typeof order.supplier !== 'string' || !order.supplier.trim() || order.supplier.length > 300) {
    return { ok: false, message: '供应商名称不能为空' };
  }
  if (typeof order.deliveryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(order.deliveryDate) ||
      Number.isNaN(Date.parse(order.deliveryDate)) ||
      new Date(order.deliveryDate).toISOString().slice(0, 10) !== order.deliveryDate) {
    return { ok: false, message: '请选择有效的交货日期' };
  }
  for (const value of Object.values(order)) {
    if (typeof value !== 'string' || value.length > 3000) {
      return { ok: false, message: '单据字段格式无效' };
    }
  }
  let total = BigInt(0);
  for (const raw of object.lines) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, message: '生产明细格式无效' };
    }
    const line = raw as Record<string, unknown>;
    if (typeof line.id !== 'number' || !Number.isSafeInteger(line.id) || line.id < 0 ||
        ['category', 'name', 'spec', 'unit', 'quantity', 'price', 'note'].some(key =>
          typeof line[key] !== 'string' || (line[key] as string).length > 3000
        ) || !(line.name as string).trim() || !(line.unit as string).trim()) {
      return { ok: false, message: '请核对生产明细内容、名称和单位' };
    }
    const value = lineAmountThousandths(line.quantity as string, line.price as string);
    if (value === null) {
      return { ok: false, message: '数量必须大于0，单价不能为负，最多支持三位小数' };
    }
    total += value;
    if (total > MAX_SAFE_MILLI) {
      return { ok: false, message: '订单金额超过安全计算范围' };
    }
  }
  return { ok: true, snapshot: snapshot as SupplierOrderPayload, amountThousandths: Number(total) };
}
