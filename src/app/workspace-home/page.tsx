'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PORTAL_GROUPS, WORKSPACE_HOME } from '@/lib/constants/navigation';
import EnvStatusBadge from '@/components/system/EnvStatusBadge';

const MOCK_METRICS = {
  pendingReview: 5,
  pendingPublish: 3,
  weeklyProgress: 68,
  systemHealth: 'healthy',
};

export default function WorkspaceHome() {
  const [user] = useState(() => {
    if (typeof window !== 'undefined') {
      const u = localStorage.getItem('nmc_user');
      return u ? JSON.parse(u) : null;
    }
    return null;
  });

  const totalTodos = PORTAL_GROUPS.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">宏</div>
            <div>
              <h1 className="text-base font-bold text-gray-800">宏达新媒体作战中台</h1>
              <p className="text-[10px] text-gray-400">广东宏达印业</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <EnvStatusBadge />
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs text-blue-700 font-medium">
                {user?.full_name?.charAt(0) || 'U'}
              </span>
              <span>{user?.full_name || '用户'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* === FIRST SCREEN: Portal Cards === */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-800">选择工作门户</h2>
            <span className="text-xs text-gray-400">共 {totalTodos} 个功能模块</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PORTAL_GROUPS.map(portal => {
              const colors: Record<string, string> = {
                blue: 'from-blue-500 to-blue-600',
                green: 'from-emerald-500 to-emerald-600',
                purple: 'from-purple-500 to-purple-600',
                gray: 'from-gray-600 to-gray-700',
              };
              const bgColors: Record<string, string> = {
                blue: 'bg-blue-50 border-blue-200',
                green: 'bg-emerald-50 border-emerald-200',
                purple: 'bg-purple-50 border-purple-200',
                gray: 'bg-gray-50 border-gray-200',
              };
              const btnColors: Record<string, string> = {
                blue: 'text-blue-700 bg-blue-100 hover:bg-blue-200',
                green: 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200',
                purple: 'text-purple-700 bg-purple-100 hover:bg-purple-200',
                gray: 'text-gray-700 bg-gray-200 hover:bg-gray-300',
              };
              return (
                <div key={portal.id} className={`rounded-xl border ${bgColors[portal.color]} overflow-hidden shadow-sm hover:shadow-md transition-shadow`}>
                  <div className={`bg-gradient-to-r ${colors[portal.color]} px-5 py-4`}>
                    <p className="text-2xl mb-1">{portal.icon}</p>
                    <h3 className="text-white font-bold text-lg">{portal.label}</h3>
                    <p className="text-white/80 text-xs mt-0.5">{portal.description}</p>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                      <span>{portal.items.length} 个模块</span>
                      <span>待办 0</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {portal.items.slice(0, 6).map(item => (
                        <Link key={item.path} href={item.path}
                          className="text-xs text-gray-600 hover:text-blue-600 px-2 py-1 rounded bg-white/60 hover:bg-white transition-colors no-underline">
                          {item.icon} {item.label}
                        </Link>
                      ))}
                      {portal.items.length > 6 && (
                        <span className="text-xs text-gray-400 px-2 py-1">+{portal.items.length - 6} 更多</span>
                      )}
                    </div>
                    <div className="pt-2">
                      <Link href={portal.items[0]?.path || '#'}
                        className={`block text-center text-xs font-medium px-3 py-1.5 rounded-lg transition-colors no-underline ${btnColors[portal.color]}`}>
                        进入{portal.label} →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* === SECOND SCREEN: Status Dashboard === */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-4">今日概览</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">👀</span>
                <span className="text-sm font-medium text-gray-700">今日待审核</span>
              </div>
              <p className="text-2xl font-bold text-yellow-600">{MOCK_METRICS.pendingReview}</p>
              <p className="text-xs text-gray-400 mt-1">脚本和选题审核</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🚀</span>
                <span className="text-sm font-medium text-gray-700">今日待发布</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{MOCK_METRICS.pendingPublish}</p>
              <p className="text-xs text-gray-400 mt-1">排好未发布</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📈</span>
                <span className="text-sm font-medium text-gray-700">本周内容进度</span>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-green-600">{MOCK_METRICS.weeklyProgress}%</p>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: MOCK_METRICS.weeklyProgress + '%' }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">计划 12/已发布 8</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">💊</span>
                <span className="text-sm font-medium text-gray-700">系统健康</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <p className="text-2xl font-bold text-green-600">正常</p>
              </div>
              <p className="text-xs text-gray-400 mt-1">AI Mock模式 · 7个接口在线</p>
            </div>
          </div>
        </section>

        {/* === THIRD SCREEN: 最近待办 === */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-4">最近待办</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">事项</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">所属模块</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">状态</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { task: '待审核脚本', module: '新媒体', status: '待审核', color: 'text-yellow-600', path: '/scripts' },
                  { task: '待审核选题', module: '新媒体', status: '待审核', color: 'text-yellow-600', path: '/topics' },
                  { task: '待发布文章', module: '公众号', status: '草稿', color: 'text-blue-600', path: '/oa/articles' },
                  { task: '待确认知识卡', module: '知识库', status: '待确认', color: 'text-purple-600', path: '/knowledge' },
                  { task: '未分配线索', module: '新媒体', status: '待跟进', color: 'text-orange-600', path: '/leads' },
                ].map((item, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-700">{item.task}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{item.module}</td>
                    <td className={`px-4 py-2.5 text-xs font-medium ${item.color}`}>{item.status}</td>
                    <td className="px-4 py-2.5 text-right">
                      <a href={item.path}
                        className="text-xs text-blue-600 hover:text-blue-800 no-underline">去处理 →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* === FOURTH SCREEN: Quick Actions === */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-4">快速新建</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: '新建脚本', icon: '✍️', path: '/scripts', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
              { label: '新建文章', icon: '✏️', path: '/official/article-factory', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
              { label: '新建知识卡', icon: '📇', path: '/knowledge', color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
              { label: '新建选题', icon: '📋', path: '/topics', color: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100' },
              { label: '导入CSV', icon: '📥', path: '/settings', color: 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100' },
            ].map(btn => (
              <Link key={btn.label} href={btn.path}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors no-underline ${btn.color}`}>
                <span>{btn.icon}</span>
                {btn.label}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
