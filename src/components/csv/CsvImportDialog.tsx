'use client';
import { useState, useRef } from 'react';
import {
  CsvEntity, CsvFieldDef, CsvImportResult, CSV_FIELD_DEFS,
  parseCsv, validateRow, getFieldLabel
} from '@/lib/csv-utils';

interface CsvImportDialogProps {
  entity: CsvEntity;
  onImport: (rows: Record<string, string>[], sourceHeaders: string[]) => CsvImportResult;
  onClose: () => void;
}

export default function CsvImportDialog({ entity, onImport, onClose }: CsvImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ row: number; field: string; message: string }[]>([]);
  const [dryRunValid, setDryRunValid] = useState(false);

  const defs = CSV_FIELD_DEFS[entity];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { headers, rows, errors: parseErrors } = parseCsv(text);
    
    if (parseErrors.length > 0) {
      setParseErrors(parseErrors);
    }
    
    setParsedHeaders(headers);
    setParsedRows(rows);
    setStep('preview');
    
    // Run validation
    const allErrors: { row: number; field: string; message: string }[] = [];
    rows.forEach((row, i) => {
      const rowErrors = validateRow(entity, row, i);
      rowErrors.forEach(e => allErrors.push({ row: i + 2, field: e.field, message: e.message }));
    });
    setValidationErrors(allErrors);
    setDryRunValid(rows.length > 0 && allErrors.length === 0);
  };

  const handleImport = () => {
    const result = onImport(parsedRows, parsedHeaders);
    setImportResult(result);
    setStep('result');
  };

  const handleDownloadTemplate = () => {
    const { downloadTemplate } = require('@/lib/csv-utils');
    downloadTemplate(entity);
  };

  const entityLabel: Record<string, string> = {
    accounts: '账号', topics: '选题', posts: '发布视频', leads: '线索', knowledge: '知识卡',
  };

  const needed = defs.filter(d => d.required);
  const optional = defs.filter(d => !d.required);

  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg p-5 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">导入{entityLabel[entity] || entity}</h3>
          <button className="text-gray-400 hover:text-gray-600 text-lg" onClick={onClose}>✕</button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1 mb-4">
          {['upload', 'preview', 'result'].map((s, i) => (
            <div key={s} className={'flex-1 h-1.5 rounded-full ' + (s === step ? 'bg-blue-500' : i < ['upload','preview','result'].indexOf(step) ? 'bg-green-400' : 'bg-gray-200')} />
          ))}
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 text-sm">
              <p className="font-medium text-gray-700 mb-2">字段说明</p>
              <p className="text-xs text-gray-500 mb-2"><span className="text-red-500">*</span> 为必填字段</p>
              <div className="space-y-1">
                <p className="text-xs text-gray-600 font-medium">必填字段：{needed.map(d => d.label).join('、')}</p>
                <p className="text-xs text-gray-500">可选字段：{optional.map(d => d.label).join('、')}</p>
              </div>
              {optional.filter(d => d.enumValues).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600 font-medium">枚举字段可选值：</p>
                  {optional.filter(d => d.enumValues).map(d => (
                    <p key={d.key} className="text-[10px] text-gray-500">{d.label}：{d.enumValues!.join('、')}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              <button className="btn-secondary btn-sm" onClick={handleDownloadTemplate}>下载模板</button>
            </div>
            {parseErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-600">
                {parseErrors.map((e, i) => <p key={i}>⚠ {e}</p>)}
              </div>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">共解析 <strong>{parsedRows.length}</strong> 行数据</p>
              <div className="flex items-center gap-2 text-xs">
                {validationErrors.length > 0 ? (
                  <span className="text-red-600">{validationErrors.length} 个错误</span>
                ) : (
                  <span className="text-green-600">验证通过</span>
                )}
              </div>
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1 text-left text-gray-500">#</th>
                    {parsedHeaders.map(h => (
                      <th key={h} className="px-2 py-1 text-left text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1 text-gray-400">{i + 2}</td>
                      {parsedHeaders.map(h => (
                        <td key={h} className="px-2 py-1 text-gray-700 max-w-[150px] truncate">{row[h] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedRows.length > 10 && (
              <p className="text-[10px] text-gray-400">仅显示前 10 行，共 {parsedRows.length} 行</p>
            )}

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-2 space-y-1 max-h-32 overflow-y-auto">
                <p className="text-xs font-medium text-red-700">导入错误（需修正后重新上传）</p>
                {validationErrors.map((e, i) => (
                  <p key={i} className="text-[10px] text-red-600">第 {e.row} 行 · {getFieldLabel(entity, e.field)}：{e.message}</p>
                ))}
              </div>
            )}

            <div className="flex justify-between">
              <button className="btn-secondary btn-sm" onClick={() => setStep('upload')}>重新选择</button>
              <button className="btn-primary btn-sm" disabled={!dryRunValid} onClick={handleImport}>
                确认导入 ({parsedRows.length} 条)
              </button>
            </div>
          </div>
        )}

        {step === 'result' && importResult && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded p-3 text-center">
                <p className="text-xl font-bold text-green-600">{importResult.created}</p>
                <p className="text-[10px] text-green-700">新增</p>
              </div>
              <div className="bg-blue-50 rounded p-3 text-center">
                <p className="text-xl font-bold text-blue-600">{importResult.updated}</p>
                <p className="text-[10px] text-blue-700">更新</p>
              </div>
              <div className="bg-red-50 rounded p-3 text-center">
                <p className="text-xl font-bold text-red-600">{importResult.failed}</p>
                <p className="text-[10px] text-red-700">失败</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-2 space-y-1 max-h-32 overflow-y-auto">
                <p className="text-xs font-medium text-red-700">失败详情</p>
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-[10px] text-red-600">第 {e.row} 行 · {e.message}</p>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-500">
              成功导入 {importResult.created} 条，失败 {importResult.failed} 条，共计 {importResult.total} 条
            </p>

            <button className="btn-primary btn-sm" onClick={onClose}>完成</button>
          </div>
        )}
      </div>
    </div>
  );
}
