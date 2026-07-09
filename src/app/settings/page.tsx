'use client';
import { useState, useEffect } from 'react';
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
  const [oaStatus, setOaStatus] = useState<{connected:boolean; accountName?:string; error?:string}>({connected:false});

  useEffect(() => {
    fetch('/api/oa/connect')
      .then(r => r.json())
      .then(d => setOaStatus({connected: d.connected, accountName: d.accountName, error: d.error}))
      .catch(() => setOaStatus({connected: false, error: '无法连接'}));
  }, []);

  const entities: { key: CsvEntity; label: string }[] = [
    { key: 'accounts', label: '账号' },
    { key: 'topics', label: '选题' },
    { key: 'posts', label: '已发布视频' },
    { key: 'leads', label: '线索' },
    { key: 'knowledge', label: '知识卡' },
  ];

  const handleImport = (entity: CsvEntity, rows: Record<string, string>[], sourceHeaders: string[]): CsvImportResult => {
    const key = STORAGE_KEYS[entity.toUpperCase() as keyof typeof STORAGE_KEYS] || 'hongda_' + entity;
    const existing = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(key) || '[]') : [];
    const result: CsvImportResult = {
      total: rows.length, created: 0, updated: 0, failed: 0, errors: [], preview: []
    };
    rows.forEach((row, i) => {
      const newItem: any = { id: entity + '_csv_' + Date.now() + '_' + i };
      const defs = CSV_FIELD_DEFS[entity];
      let hasError = false;
      defs.forEach(def => {
        const sourceIdx = sourceHeaders.findIndex(h => h === def.label || h === def.key);
        const val = sourceIdx >= 0 ? (row[sourceHeaders[sourceIdx]] || '').trim() : (row[def.key] || row[def.label] || '').trim();
        if (def.required && !val) {
          result.errors.push({ row: i + 2, field: def.key, message: '"' + def.label + '" 必填' });
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
    { key: 'oa', label: '公众号连接' },
    { key: 'ai', label: 'AI规则设置' },
    { key: 'csv', label: 'CSV导入导出' },
    { key: 'migrate', label: '数据迁移' },
  ];

  const getRoleBadge = (role: string) => {
    const map: Record<string, string> = {
      admin: 'badge-red', manager: 'badge-purple', operator: 'badge-blue', sales: 'badge-green', viewer: 'badge-gray',
    };
    return map[role] || 'badge-gray';
  };

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
                  <th className="table-header">姓名</th><th className="table-header">邮箱</th><th className="table-header">角色</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_USERS.map(u => (
                  <tr key={u.id} className="border-b border-gray-100">
                    <td className="table-cell font-medium">{u.full_name}</td>
                    <td className="table-cell text-gray-500">{u.email}</td>
                    <td className="table-cell">
                      <span className={getRoleBadge(u.role)}>
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
            <div className="p-3 bg-red-50 rounded"><span className="font-medium text-red-700">管理员：</span><span className="text-red-600"> 系统管理员，可以管理所有数据</span></div>
            <div className="p-3 bg-purple-50 rounded"><span className="font-medium text-purple-700">管理者：</span><span className="text-purple-600"> 可以看所有账号、复盘、线索</span></div>
            <div className="p-3 bg-blue-50 rounded"><span className="font-medium text-blue-700">运营：</span><span className="text-blue-600"> 可以管理选题、脚本、发布、复盘、线索</span></div>
            <div className="p-3 bg-green-50 rounded"><span className="font-medium text-green-700">销售：</span><span className="text-green-600"> 可以查看和跟进分配给自己的线索</span></div>
            <div className="p-3 bg-gray-50 rounded"><span className="font-medium text-gray-700">只读：</span><span className="text-gray-600"> 只读角色</span></div>
          </div>
        </div>
      )}

      {activeTab === 'dicts' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">字典管理</h3>
          <p className="text-sm text-gray-500">以下字典项已在系统中配置：</p>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-gray-50 rounded"><p className="font-medium text-gray-700">内容类型</p><p className="text-xs text-gray-500 mt-1">产品展示、工艺讲解、案例分析、问答解惑、工厂实拍、行业观点、教程指南</p></div>
            <div className="p-3 bg-gray-50 rounded"><p className="font-medium text-gray-700">需求类型</p><p className="text-xs text-gray-500 mt-1">花膜、加工、设备、工艺咨询、不明确</p></div>
            <div className="p-3 bg-gray-50 rounded"><p className="font-medium text-gray-700">知识分类</p><p className="text-xs text-gray-500 mt-1">公司介绍、工艺知识、材料适配、产品设备、客户FAQ、人设指南、爆款拆解、复盘案例、线索话术、风险规则</p></div>
            <div className="p-3 bg-gray-50 rounded"><p className="font-medium text-gray-700">线索等级</p><p className="text-xs text-gray-500 mt-1">A-高价值、B-中价值、C-待观察、D-低价值</p></div>
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
        </div>
      )}

      {activeTab === 'oa' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">微信公众号连接配置</h3>
          <div className="flex items-center gap-3 mb-4">
            <span className={`w-3 h-3 rounded-full ${oaStatus.connected ? 'bg-green-500' : 'bg-gray-300'}`}></span>
            <span className={`text-sm font-medium ${oaStatus.connected ? 'text-green-700' : 'text-gray-500'}`}>
              {oaStatus.connected ? '已连接' : '未连接'}
            </span>
            {oaStatus.connected && oaStatus.accountName && (
              <span className="text-xs text-green-600">{oaStatus.accountName}</span>
            )}
            {!oaStatus.connected && oaStatus.error && (
              <span className="text-xs text-red-400 max-w-md truncate">{oaStatus.error}</span>
            )}
          </div>
          {oaStatus.connected && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 mb-4">
              ✅ 公众号已成功接入。可通过代理服务器（DigitalOcean 固定 IP）调用微信 API。
            </div>
          )}
          {!oaStatus.connected && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
              <p className="font-medium text-amber-800 mb-2">接入步骤</p>
              <ol className="list-decimal ml-4 space-y-2 text-xs text-amber-700">
                <li>在微信公众平台 → 设置与开发 → 开发接口管理，获取 AppID 和 AppSecret</li>
                <li>在 Vercel 项目设置环境变量：WECHAT_APP_ID、WECHAT_APP_SECRET、WECHAT_ACCOUNT_NAME</li>
                <li>已在 IP 白名单添加 DigitalOcean 固定 IP：139.59.112.84</li>
                <li>部署完成后可在文章库中保存草稿和发布</li>
              </ol>
            </div>
          )}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700 mt-3">
            安全提醒：AppSecret 仅存储在服务端环境变量中，前端不会暴露。微信 API 通过 DigitalOcean 固定 IP 代理调用。
          </div>
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

      {activeTab === 'migrate' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">数据迁移</h3>
          <p className="text-sm text-gray-500 mb-4">将现有知识卡、选题、脚本数据补齐新字段，并重算评分与风险等级。</p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
            建议先运行 Dry Run 预览变更，确认无误后再执行完整迁移。
          </div>
          <div className="flex gap-3">
            <button id="btn-migrate-dryrun"
              className="btn-secondary text-sm"
              onClick={async () => {
                const btn = document.getElementById('btn-migrate-dryrun') as HTMLButtonElement;
                btn.disabled = true; btn.textContent = '运行中...';
                try {
                  const res = await fetch('/api/data/migrate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({mode:'dry_run'}) });
                  const data = await res.json();
                  const r = data.report;
                  alert('Dry Run 完成\n知识卡：' + r.knowledge.total + ' 总/' + r.knowledge.fixed + ' 需修复\n选题：' + r.topics.total + ' 总/' + r.topics.fixed + ' 需修复\n脚本：' + r.scripts.total + ' 总/' + r.scripts.scored + ' 需评分\n' + (data.suggestion || ''));
                } catch(e:any) { alert('Error: ' + e.message); }
                btn.disabled = false; btn.textContent = 'Dry Run 预览';
              }}>
              Dry Run 预览
            </button>
            <button id="btn-migrate-execute"
              className="btn-primary text-sm"
              onClick={async () => {
                if (!confirm('确定要执行数据迁移吗？建议先运行 Dry Run 预览。')) return;
                const btn = document.getElementById('btn-migrate-execute') as HTMLButtonElement;
                btn.disabled = true; btn.textContent = '迁移中...';
                try {
                  const res = await fetch('/api/data/migrate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({mode:'execute'}) });
                  const data = await res.json();
                  if (data.success) {
                    const r = data.report;
                    alert('迁移完成！\n知识卡：' + r.knowledge.fixed + ' 条已修复\n选题：' + r.topics.fixed + ' 条已修复\n脚本：' + r.scripts.scored + ' 条已评分\n建议人工复核列表：请检查数据完整性');
                  } else {
                    alert('迁移失败：' + (data.error || '未知错误'));
                  }
                } catch(e:any) { alert('Error: ' + e.message); }
                btn.disabled = false; btn.textContent = '执行迁移';
              }}>
              执行迁移
            </button>
          </div>
        </div>
      )}

      {activeTab === 'platform' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">微信视频号接入</h3>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-3 h-3 rounded-full bg-gray-300"></span>
              <span className="text-sm text-gray-600">未连接（需企业微信认证）</span>
            </div>
            <div className="bg-gray-50 rounded p-3 text-sm">
              <p className="text-gray-500 mb-2">平台API对接将在第二期实现。当前通过手动录入 + 知识库 + AI生成。</p>
            </div>
          </div>
        </div>
      )}

      {importEntity && (
        <CsvImportDialog
          entity={importEntity}
          onImport={(rows, sourceHeaders) => handleImport(importEntity, rows, sourceHeaders)}
          onClose={() => setImportEntity(null)}
        />
      )}
    </AppLayout>
  );
}
