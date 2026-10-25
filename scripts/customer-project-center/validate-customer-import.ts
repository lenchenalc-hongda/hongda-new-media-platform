/**
 * Read-only preflight for workshop customer-pool JSON exports.
 *
 * Usage:
 * node node_modules/tsx/dist/cli.mjs scripts/customer-project-center/validate-customer-import.ts /path/to/shared-data.json
 *
 * No client names or document contents are printed, and no DB write occurs.
 */
import { readFileSync } from 'node:fs';
import { findInvalidCustomerNameRows } from '../../src/lib/customer-projects/customer-name-integrity';

type ObjectRow = Record<string, unknown>;

function isObject(value: unknown): value is ObjectRow {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function selectRows(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return null;
  if (Array.isArray(value.customers)) return value.customers;
  if (Array.isArray(value.rows)) return value.rows;
  return null;
}

function main(): void {
  const filePath = process.argv[2];
  if (!filePath || process.argv.length !== 3) {
    console.error('用法: validate-customer-import.ts <customer-json-file>');
    process.exitCode = 2;
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    console.error('预检失败：无法以 UTF-8 读取或解析 JSON。未导入任何数据。');
    process.exitCode = 2;
    return;
  }

  const rows = selectRows(raw);
  if (!rows) {
    console.error('预检失败：缺少客户数组。未导入任何数据。');
    process.exitCode = 2;
    return;
  }

  const names = rows.map(row => ({
    displayNameSnapshot: isObject(row)
      ? row.display_name_snapshot ?? row.displayNameSnapshot ?? row.customerName
      : null,
  }));
  const invalid = findInvalidCustomerNameRows(names);
  if (invalid.length) {
    console.error(
      '预检未通过：' + invalid.length + '/' + rows.length
      + ' 条客户名称为空或含 Unicode 替换字符。问题行号（从 1 开始）：'
      + invalid.map(index => index + 1).join(', ')
      + '。请在客户权威来源修复后重新导出；未导入任何数据。',
    );
    process.exitCode = 1;
    return;
  }

  console.info('预检通过：' + rows.length + ' 条客户名称无替换字符；未写入数据库。');
}

main();
