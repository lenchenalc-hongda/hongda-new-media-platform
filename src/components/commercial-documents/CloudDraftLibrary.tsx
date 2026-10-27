'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type DraftRow = {
  id: string; owner_profile_id: string; document_no: string;
  buyer_name: string; project_name: string; language: 'zh'|'en';
  revision: number; updated_at: string;
};
type Revision = {
  revision: number; status: string; recorded_at: string; editor_profile_id: string;
};

export default function CloudDraftLibrary({ currentProfileId, canSeeTeam }: {
  currentProfileId: string; canSeeTeam: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'mine'|'team'>('mine');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [historyId, setHistoryId] = useState('');
  const [history, setHistory] = useState<Revision[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/commercial-documents/drafts?search=' + encodeURIComponent(query), { cache: 'no-store' });
      const json = await r.json();
      if (!r.ok || !json.ok || !Array.isArray(json.drafts)) throw new Error(json.message || '读取草稿失败');
      setRows(json.drafts); setLoaded(true);
    } catch (e) { setError(e instanceof Error ? e.message : '网络异常，请重试'); }
    finally { setBusy(false); }
  }, [query]);
  useEffect(() => { void load(); }, [load]);

  const visible = rows.filter(row => scope === 'team' || row.owner_profile_id === currentProfileId);
  const openHistory = async (id: string) => {
    if (historyId === id) { setHistoryId(''); setHistory([]); return; }
    setHistoryBusy(true); setError(''); setHistoryId(id); setHistory([]);
    try {
      const r = await fetch('/api/commercial-documents/drafts/' + encodeURIComponent(id) + '/revisions', { cache: 'no-store' });
      const json = await r.json();
      if (!r.ok || !json.ok || !Array.isArray(json.revisions)) throw new Error(json.message || '读取历史失败');
      setHistory(json.revisions);
    } catch (e) { setError(e instanceof Error ? e.message : '读取历史失败'); }
    finally { setHistoryBusy(false); }
  };
  const remove = async (row: DraftRow) => {
    if (!window.confirm('将这份草稿移入回收状态？历史修订不会被直接删除。')) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/commercial-documents/drafts/' + encodeURIComponent(row.id), {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: row.revision }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.message || '操作失败');
      await load(); setHistoryId('');
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const open = (id: string, revision?: number) => router.push(
    '/commercial-documents?draftId=' + encodeURIComponent(id) +
    (revision ? '&restoreRevision=' + encodeURIComponent(String(revision)) : ''),
  );

  return (
    <section className="space-y-5" aria-label="云端草稿箱">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">HongdaOS / 商务单据</p>
          <h1 className="text-2xl font-semibold text-gray-900">云端草稿箱</h1>
          <p className="text-sm text-gray-500 mt-1">管理未完成的报价，继续编辑或查看历史修订。正式报价 PDF 归档尚未开放。</p>
        </div>
        <button className="btn-primary btn-sm" type="button" onClick={() => router.push('/commercial-documents')}>＋ 新建报价</button>
      </div>
      <div className="rounded-xl border bg-white p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[220px] text-xs text-gray-600">
            <span className="block mb-1">搜索草稿</span>
            <input className="w-full" value={term} onChange={e => setTerm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setQuery(term.trim()); }}
              placeholder="报价编号、客户名称" aria-label="搜索报价编号或客户" />
          </label>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setQuery(term.trim())} disabled={busy}>搜索</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()} disabled={busy}>刷新</button>
          {canSeeTeam && <label className="text-xs text-gray-600">范围
            <select className="block" value={scope} onChange={e => setScope(e.target.value as 'mine'|'team')}>
              <option value="mine">我的草稿</option><option value="team">本组织全部</option>
            </select>
          </label>}
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{loaded ? '共 ' + visible.length + ' 条（最多显示最近 80 条）' : '正在读取草稿…'}</span>
          {busy && <span role="status">正在更新…</span>}
        </div>
        {error && <div role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-800 p-3 text-sm">{error}</div>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b bg-gray-50 text-gray-600 text-left">
              <th className="p-3">报价编号 / 客户</th><th className="p-3">项目</th>
              <th className="p-3">负责人</th><th className="p-3">更新 / 版本</th><th className="p-3">操作</th>
            </tr></thead>
            <tbody>
              {visible.map(row => {
                const mine = row.owner_profile_id === currentProfileId;
                return <tr className="border-b align-top" key={row.id}>
                  <td className="p-3"><strong>{row.document_no || '尚未编号'}</strong>
                    <div className="text-xs text-gray-500 mt-1">{row.buyer_name || '客户未填写'} · {row.language === 'en' ? 'English' : '中文'}</div>
                  </td>
                  <td className="p-3 text-gray-600">{row.project_name || '—'}</td>
                  <td className="p-3 text-gray-600">{mine ? '我' : '其他负责人（只读）'}</td>
                  <td className="p-3 text-gray-600">{new Date(row.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}<div>V{row.revision}</div></td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => open(row.id)}>{mine ? '继续编辑' : '查看详情'}</button>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => void openHistory(row.id)}>历史修订</button>
                      {mine && <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void remove(row)}>移入回收</button>}
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
          {loaded && visible.length === 0 && !busy && <div className="text-center p-10 text-sm text-gray-500">
            暂无符合条件的草稿，可点击右上角「新建报价」开始。
          </div>}
        </div>
        {historyId && <div className="border rounded-lg bg-gray-50 p-4 space-y-2">
          <div className="flex justify-between items-center"><h2 className="font-medium text-gray-900">草稿历史修订（最近 30 次）</h2>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setHistoryId('')}>收起</button></div>
          {historyBusy && <p className="text-sm text-gray-500">正在加载…</p>}
          {history.map(v => <div key={v.revision} className="flex flex-wrap justify-between gap-3 items-center border-b py-2 text-sm">
            <span>V{v.revision} · {new Date(v.recorded_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => open(historyId, v.revision)}>基于此版本继续修改</button>
          </div>)}
        </div>}
      </div>
    </section>
  );
}
