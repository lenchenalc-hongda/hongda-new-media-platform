'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import CsvImportDialog from '@/components/csv/CsvImportDialog';
import CsvExportButton from '@/components/csv/CsvExportButton';
import { MOCK_USERS } from '@/lib/constants/mock-data';
import { CSV_FIELD_DEFS, CsvEntity, CsvImportResult, downloadTemplate } from '@/lib/csv-utils';
import { MOCK_TOPICS, ALL_MOCK_SCRIPTS, MOCK_KNOWLEDGE_NEW } from '@/lib/constants/mock-data';
import { STORAGE_KEYS } from '@/lib/storage';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('users');
  const [importEntity, setImportEntity] = useState<CsvEntity | null>(null);

  const entities: { key: CsvEntity; label: string }[] = [
    { key: 'accounts', label: '账号' },
    { key: 'topics', label: '选题' },
    { key: 'posts', label: '已发布视频' },
    { key: 'leads', label: '线索' },
    { key: 'knowledge', label: '知识卡' },
  ];

  const handleImport = (entity: CsvEntity, rows: Record<string, string>[], sourceHeaders: string[]): CsvImportResult => {
    const key = STORAGE_KEYS[entity.toUpperCase() as keyof typeof STORAGE_KEYS] || `hongda_${entity}`;
    const existing = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(key) || '[]') : [];
    const result: CsvImportResult = {
      total: rows.length, created: 0, updated: 0, failed: 0, errors: [], preview: []
    };

    rows.forEach((row, i) => {
      const newItem: any = { id: `${entity}_csv_${Date.now()}_${i}` };
      const defs = CSV_FIELD_DEFS[entity];
      let hasError = false;

      defs.forEach(def => {
        // Try source label first, then field key
        const sourceIdx = sourceHeaders.findIndex(h => h === def.label || h === def.key);
        const val = sourceIdx >= 0 ? (row[sourceHeaders[sourceIdx]] || '').trim() : (row[def.key] || row[def.label] || '').trim();
        
        if (def.required && !val) {
          result.errors.push({ row: i + 2, field: def.key, message: `"${def.label}" 必填` });
          hasError = true;
          return;
        }
        if (val) {
          if (def.type === 'number') newItem[def.key] = Number(val);
          else newItem[def.key] = val;
        }
      });

      if (hasError) {
        result.failed++;
      } else {
        newItem.org_id = 'org_001';
        newItem.created_at = new Date().toISOString();
        if (!newItem.status) newItem.status = 'draft';
        if (!newItem.priority) newItem.priority = '中';
        existing.push(newItem);
        result.created++;
      }
    });

    localStorage.setItem(key, JSON.stringify(existing));
    return result;
  };

  const tabs = [
    { key: 'users', label: '用户管理' },
    { key: 'roles', label: '角色说明' },
    { key: 'dicts', label: '字典管理' },
    { key: 'platform', label: '平台接入' },
    { key: 'ai', label: 'AI规则设置' },
    { key: 'csv', label: 'CSV导入导出' },
  ];

  return (
    <AppLayout>
      <PageHeader title="设置" description="系统配置与管理" />

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={'px-4 py-2 text-sm font-medium border-b-2 transition-colors ' + (activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">用户列表</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="table-header">姓名</th>
                  <th className="table-header">邮箱</th>
                  <th className="table-header">角色</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_USERS.map(u => (
                  <tr key={u.id} className="border-b border-gray-100">
                    <td className="table-cell font-medium">{u.full_name}</td>
                    <td className="table-cell text-gray-500">{u.email}</td>
                    <td className="table-cell">
                      <span className={'badge-' + ((String(u.role) === 'admin' || String(u.role) === 'manager') ? 'purple' : 'blue')}>
                        {String(u.role) === 'admin' ? '管理员' : String(u.role) === 'manager' ? '管理者' : '运营'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">用户管理功能将在对接Supabase Auth后完善</p>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">角色权限说明</h3>
          <div className="space-y-3 text-sm">
            {[
              { role: 'admin', label: '管理员', color: 'red', desc: '系统管理员，可以管理所有数据' },
              { role: 'manager', label: '管理者', color: 'purple', desc: '可以看所有账号、复盘、线索' },
              { role: 'operator', label: '运营', color: 'blue', desc: '可以管理选题、脚本、发布、复盘、线索' },
              { role: 'sales', label: '销售', color: 'green', desc: '可以查看和跟进分配给自己的线索' },
              { role: 'viewer', label: '只读', color: 'gray', desc: '只读角色' },
            ].map(r => (
              <div key={r.role} className={'p-3 bg-' + r.color + '-50 rounded'}>
                <span className={'font-medium text-' + r.color + '-700'}>{r.label}：</span>
                <span className={'text-' + r.color + '-600'}>{r.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'dicts' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">字典管理</h3>
          <p className="text-sm text-gray-500">以下字典项已在系统中配置：</p>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            {[
              { title: '内容类型', desc: '产品展示、工艺讲解、案例分析、问答解惑、工厂实拍、行业观点、教程指南' },
              { title: '需求类型', desc: '花膜、加工、设备、工艺咨询、不明确' },
              { title: '知识分类', desc: '公司介绍、工艺知识、材料适配、产品设备、客户FAQ、人设指南、爆款拆解、复盘案例、线索话术、风险规则' },
              { title: '线索等级', desc: 'A-高价值、B-中价值、C-待观察、D-低价值' },
            ].map(d => (
              <div key={d.title} className="p-3 bg-gray-50 rounded">
                <p className="font-medium text-gray-700">{d.title}</p>
                <p className="text-xs text-gray-500 mt-1">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'csv' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">CSV导入</h3>
            <p className="text-sm text-gray-500 mb-3">选择数据类型，下载模板后填入数据再上传导入：</p>
            <div className="grid grid-cols-5 gap-3">
              {entities.map(ent => (
                <div key={ent.key} className="p-4 border border-gray-200 rounded-lg text-center hover:border-blue-300 transition-colors">
                  <p className="text-sm font-medium text-gray-700 mb-3">{ent.label}</p>
                  <div className="space-y-2">
                    <button className="btn-primary btn-sm w-full text-xs" onClick={() => setImportEntity(ent.key)}>导入</button>
                    <button className="btn-secondary btn-sm w-full text-xs" onClick={() => downloadTemplate(ent.key)}>下载模板</button>
                    <CsvExportButton entity={ent.key} headers={[]} data={[]} label="导出空表" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">模板字段说明</h3>
            <p className="text-sm text-gray-500 mb-2">各类型 CSV 模板的字段定义：</p>
            {entities.map(ent => {
              const defs = CSV_FIELD_DEFS[ent.key];
              return (
                <details key={ent.key} className="mb-2">
                  <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-blue-600">{ent.label}</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50"><th className="px-2 py-1 text-left text-gray-500">字段</th><th className="px-2 py-1 text-left text-gray-500">必填</th><th className="px-2 py-1 text-left text-gray-500">类型</th><th className="px-2 py-1 text-left text-gray-500">可选值</th></tr>
                      </thead>
                      <tbody>
                        {defs.map(d => (
                          <tr key={d.key} className="border-t border-gray-100">
                            <td className="px-2 py-1 font-medium text-gray-700">{d.label}</td>
                            <td className="px-2 py-1">{d.required ? <span className="text-red-500">是</span> : '否'}</td>
                            <td className="px-2 py-1 text-gray-500">{d.type || '文本'}</td>
                            <td className="px-2 py-1 text-gray-400 max-w-[200px] truncate">{d.enumValues?.join('、') || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>

          {importEntity && (
            <CsvImportDialog
              entity={importEntity}
              onImport={(rows, sourceHeaders) => handleImport(importEntity, rows, sourceHeaders)}
              onClose={() => setImportEntity(null)}
            />
          )}
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">AI规则设置</h3>
          <p className="text-sm text-gray-500 mb-3">当前AI规则已在 <code className="bg-gray-100 px-1 rounded">src/lib/ai/prompts.ts</code> 中配置。</p>
          <div className="bg-gray-50 p-3 rounded text-xs text-gray-600 space-y-1 font-mono">
            <p>// 宏达新媒体AI总规则</p>
            <p>// 1. 所有输出必须站在新媒体运营角度</p>
            <p>// 2. 所有脚本必须匹配指定账号人设和定位</p>
            <p>// 3. 不允许乱承诺价格、交期、附着力</p>
            <p>// 4. 遇到产品判断必须提醒补充信息</p>
            <p>// 5. 复盘必须连接业务结果</p>
          </div>
          <p className="text-xs text-gray-400 mt-3">当前模型：{process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-4o (未配置，使用mock)'}</p>
        </div>
      )}

      {activeTab === 'platform' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">微信视频号接入</h3>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-3 h-3 rounded-full bg-gray-300"></span>
              <span className="text-sm text-gray-600">未连接</span>
              <span className="text-xs text-gray-400 ml-1">（需企业微信认证）</span>
            </div>
            <div className="bg-gray-50 rounded p-3 text-sm">
              <p className="text-gray-500 mb-2">接入说明：</p>
              <p className="text-gray-500 mb-2">个人号接入（免费）：身份证实名即可，无需营业执照。基础数据接口可用。</p>
              <p className="text-gray-500 mb-2">企业号接入（¥300/年认证费）：需要营业执照，调用频率更高。</p>
              <p className="text-xs text-gray-400 mt-2">当前版本：手动录入 + CSV导入 + AI生成。平台API对接将在第二期实现。</p>
            </div>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">抖音开放平台接入</h3>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-3 h-3 rounded-full bg-gray-300"></span>
              <span className="text-sm text-gray-600">未连接</span>
            </div>
            <div className="bg-gray-50 rounded p-3 text-sm">
              <p className="text-xs text-gray-400">当前未连接。平台API对接将在第二期实现。</p>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
