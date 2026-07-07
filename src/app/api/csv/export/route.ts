// GET /api/csv/export?entity=topics&filter=...
// Export data as CSV. For MVP, this is a placeholder that returns
// a template structure. Real data export happens client-side.

import { NextRequest, NextResponse } from 'next/server';
import { CSV_FIELD_DEFS, CsvEntity, generateCsv } from '@/lib/csv-utils';

export async function GET(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get('entity') as CsvEntity | null;
  
  if (!entity || !CSV_FIELD_DEFS[entity]) {
    return NextResponse.json({ error: 'Invalid entity' }, { status: 400 });
  }

  const defs = CSV_FIELD_DEFS[entity];
  const headers = defs.map(d => d.label);

  // Return template headers with example row
  const example: Record<string, string> = {};
  defs.forEach(d => {
    if (d.required) example[d.label] = `[必填]${d.description || ''}`;
    else if (d.enumValues) example[d.label] = d.enumValues[0];
    else example[d.label] = '';
  });

  const csv = generateCsv(headers, [example]);

  return new NextResponse('\ufeff' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${entity}_export.csv"`,
    },
  });
}
