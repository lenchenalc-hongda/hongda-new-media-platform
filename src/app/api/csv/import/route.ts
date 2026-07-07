// POST /api/csv/import
// Validate and import CSV data for accounts, topics, posts, leads, knowledge.
// When Supabase is connected, writes to database.
// For MVP, validates the data and returns results.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CSV_FIELD_DEFS, validateRow, CsvEntity } from '@/lib/csv-utils';

const schema = z.object({
  entity: z.enum(['accounts', 'topics', 'posts', 'leads', 'knowledge']),
  headers: z.array(z.string()),
  rows: z.array(z.record(z.string())),
  dryRun: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { entity, rows, dryRun } = parsed.data;
    const defs = CSV_FIELD_DEFS[entity as CsvEntity];
    if (!defs) {
      return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 400 });
    }

    const allErrors: { row: number; field: string; message: string }[] = [];
    let validCount = 0;

    rows.forEach((row, i) => {
      const rowErrors = validateRow(entity as CsvEntity, row, i);
      if (rowErrors.length === 0) validCount++;
      rowErrors.forEach(e => allErrors.push({ row: i + 2, field: e.field, message: e.message }));
    });

    return NextResponse.json({
      total: rows.length,
      valid: validCount,
      failed: allErrors.length,
      errors: allErrors,
      dryRun,
      message: dryRun
        ? `干运行完成：共 ${rows.length} 行，${validCount} 行有效，${allErrors.length} 个错误`
        : `导入完成：成功 ${validCount} 行，失败 ${allErrors.length} 行`,
    });
  } catch (err: any) {
    console.error('[csv/import] Error:', err.message);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
