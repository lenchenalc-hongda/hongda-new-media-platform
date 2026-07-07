'use client';
import { generateCsv, downloadCsv, CsvEntity, CSV_FIELD_DEFS, CsvFieldDef } from '@/lib/csv-utils';

interface CsvExportButtonProps {
  entity: CsvEntity;
  headers: string[];
  data: Record<string, string>[];
  filename?: string;
  label?: string;
}

export default function CsvExportButton({
  entity, headers, data, filename, label
}: CsvExportButtonProps) {
  const handleExport = () => {
    const defs = CSV_FIELD_DEFS[entity];
    if (!defs) return;

    // Map from entity field keys to display labels
    const exportHeaders = headers.length > 0 ? headers : defs.map(d => d.label);

    // Build rows with label keys
    const exportRows: Record<string, string>[] = data.map(row => {
      const newRow: Record<string, string> = {};
      exportHeaders.forEach(h => {
        // Try label match first, then direct key
        const def = defs.find(d => d.label === h);
        const key = def ? def.key : h;
        newRow[h] = row[key] || row[h] || '';
      });
      return newRow;
    });

    const csv = generateCsv(exportHeaders, exportRows);
    const fname = filename || `${entity}_导出_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCsv(csv, fname);
  };

  return (
    <button className="btn-secondary btn-sm text-xs" onClick={handleExport}>
      {label || '导出CSV'}
    </button>
  );
}
