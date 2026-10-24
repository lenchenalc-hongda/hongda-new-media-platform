import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { PAYMENT_METHOD_SOURCE_ROWS } from './payment-methods';

interface ArchiveEntry {
  offset: number;
  compressedLength: number;
  uncompressedLength: number;
  method: number;
}
export interface ParsedPaymentMethod {
  method_key: string;
  kind: 'bank' | 'qr';
  label_zh: string;
  label_en: string;
  beneficiary: string;
  bank_name: string;
  account_no: string;
  notes: string;
  source_cell: string;
  source_numeric: boolean;
  qr_png: Buffer | null;
  qr_sha256: string | null;
}

function parseZip(bytes: Buffer) {
  if (bytes.length > 2 * 1024 * 1024 || bytes.length < 22) throw Error('文件超出允许大小或不是 Excel');
  let tail = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { tail = i; break; }
  }
  if (tail < 0) throw Error('无效的 XLSX ZIP 文件');
  const count = bytes.readUInt16LE(tail + 10);
  const centralStart = bytes.readUInt32LE(tail + 16);
  if (count > 300 || centralStart >= bytes.length) throw Error('无效的 Excel 文件目录');
  let pos = centralStart;
  const entries = new Map<string, ArchiveEntry>();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || bytes.readUInt32LE(pos) !== 0x02014b50) throw Error('Excel ZIP 目录损坏');
    const method = bytes.readUInt16LE(pos + 10);
    const compressedLength = bytes.readUInt32LE(pos + 20);
    const uncompressedLength = bytes.readUInt32LE(pos + 24);
    const nameLength = bytes.readUInt16LE(pos + 28);
    const extraLength = bytes.readUInt16LE(pos + 30);
    const commentLength = bytes.readUInt16LE(pos + 32);
    const offset = bytes.readUInt32LE(pos + 42);
    const name = bytes.toString('utf8', pos + 46, pos + 46 + nameLength);
    if (uncompressedLength > 2 * 1024 * 1024) throw Error('Excel 内容过大');
    entries.set(name, { method, offset, compressedLength, uncompressedLength });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return (name: string): Buffer => {
    const entry = entries.get(name);
    if (!entry) throw Error('Excel 缺少必要工作表或原始图片');
    const start = entry.offset;
    if (start + 30 > bytes.length || bytes.readUInt32LE(start) !== 0x04034b50) throw Error('Excel 压缩文件损坏');
    const contentStart = start + 30 + bytes.readUInt16LE(start + 26) + bytes.readUInt16LE(start + 28);
    if (contentStart + entry.compressedLength > bytes.length) throw Error('Excel 数据长度错误');
    const compressed = bytes.subarray(contentStart, contentStart + entry.compressedLength);
    const output = entry.method === 8 ? inflateRawSync(compressed, { maxOutputLength: 2 * 1024 * 1024 })
      : entry.method === 0 ? compressed : null;
    if (!output || output.length !== entry.uncompressedLength) throw Error('Excel 数据格式或长度异常');
    return output;
  };
}

function xmlText(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity] ?? _;
  });
}
function richText(xml: string) {
  return Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), hit => xmlText(hit[1])).join('');
}

/** Parse exactly the provided source workbook without formatting, math or account-number coercion. */
export function parsePaymentWorkbook(bytes: Buffer): ParsedPaymentMethod[] {
  const get = parseZip(bytes);
  const sheet = get('xl/worksheets/sheet1.xml').toString('utf8');
  const shared = get('xl/sharedStrings.xml').toString('utf8');
  const strings = Array.from(shared.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g), hit => richText(hit[1]));
  function cell(ref: string) {
    const match = sheet.match(new RegExp('<c\\b([^>]*\\br="' + ref + '"[^>]*)>([\\s\\S]*?)<\\/c>'));
    if (!match) return { text: '', numeric: false };
    const [, attrs, contents] = match;
    const kind = attrs.match(/\bt="([^"]+)"/)?.[1];
    const v = contents.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
    if (kind === 's') {
      if (!/^\d+$/.test(v) || !strings[Number(v)] && strings[Number(v)] !== '') throw Error('Excel 共享文本索引无效');
      return { text: strings[Number(v)], numeric: false };
    }
    if (kind === 'inlineStr') return { text: richText(contents), numeric: false };
    if (kind === 'n' || (!kind && v)) {
      if (!/^\d{1,15}$/.test(v)) throw Error('银行账号存在 Excel 科学记数法，无法保证准确性');
      return { text: v, numeric: true };
    }
    return { text: xmlText(v), numeric: false };
  }

  // Match image relationship IDs to their actual anchored rows, not arbitrary image order.
  const drawing = get('xl/drawings/drawing1.xml').toString('utf8');
  const rels = get('xl/drawings/_rels/drawing1.xml.rels').toString('utf8');
  const imagePathById = new Map<string, string>();
  for (const rel of rels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = rel[1].match(/\bId="([^"]+)"/)?.[1];
    const target = rel[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target && /^\.\.\/media\/image\d+\.png$/.test(target)) {
      imagePathById.set(id, 'xl/media/' + target.split('/').pop());
    }
  }
  const imageByRow = new Map<number, Buffer>();
  for (const anchor of drawing.matchAll(/<xdr:twoCellAnchor\b[^>]*>([\s\S]*?)<\/xdr:twoCellAnchor>/g)) {
    const from = anchor[1].match(/<xdr:from>([\s\S]*?)<\/xdr:from>/)?.[1] ?? '';
    const row = from.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1];
    const id = anchor[1].match(/\br:embed="([^"]+)"/)?.[1];
    const path = id && imagePathById.get(id);
    if (row && path) imageByRow.set(Number(row) + 1, get(path));
  }
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const rows = PAYMENT_METHOD_SOURCE_ROWS.map(def => {
    const owner = cell('A' + def.row);
    const bank = cell('B' + def.row);
    const account = cell('C' + def.row);
    const notes = cell('D' + def.row);
    if (!owner.text || (def.kind === 'bank' && !account.text)) throw Error('来源表第 ' + def.row + ' 行缺少必填收款信息');
    const qr = def.kind === 'qr' ? imageByRow.get(def.row) ?? null : null;
    if (def.kind === 'qr' && (!qr || !qr.subarray(0, 8).equals(pngSignature))) {
      throw Error('无法对应第 ' + def.row + ' 行的原始 PNG 收款二维码');
    }
    if (def.kind === 'qr' && account.text) throw Error('二维码行存在意外账号数据');
    if (def.kind === 'bank' && account.numeric && !/^\d+$/.test(account.text)) throw Error('数值格式银行账号无法验证');
    if (owner.text.length > 200 || bank.text.length > 200 || account.text.length > 350 || notes.text.length > 600) {
      throw Error('源文件包含异常超长字段');
    }
    return {
      method_key: def.key,
      kind: def.kind,
      label_zh: def.labelZh,
      label_en: def.labelEn,
      beneficiary: owner.text,
      bank_name: bank.text,
      account_no: account.text,
      notes: notes.text,
      source_cell: 'Sheet1!A' + def.row + ':D' + def.row,
      source_numeric: account.numeric,
      qr_png: qr,
      qr_sha256: qr ? createHash('sha256').update(qr).digest('hex') : null,
    } as ParsedPaymentMethod;
  });
  if (cell('D5').text !== '微信' || cell('D9').text !== '支付宝') {
    throw Error('微信/支付宝二维码所在行与来源说明不一致');
  }
  return rows;
}
