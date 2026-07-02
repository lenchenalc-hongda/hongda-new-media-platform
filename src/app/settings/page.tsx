'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { MOCK_USERS } from '@/lib/constants/mock-data';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('users');

  const tabs = [
    { key: 'users', label: '用户管理' },
    { key: 'roles', label: '角色说明' },
    { key: 'dicts', label: '字典管理' },
    { key: 'platform', label: '平台接入' },
    { key: 'ai', label: 'AI规则设置' },
    { key: 'csv', label: 'CSV导入模板' },
  ];

  return (
    <AppLayout>
      <PageHeader title="设置" description="系统配置与管理" />

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
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
                      <span className={`badge-${(String(u.role) === 'admin' || String(u.role) === 'manager') ? 'purple' : 'blue'}`}>
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
            <div className="p-3 bg-red-50 rounded"><span className="font-medium text-red-700">admin（管理员）：</span><span className="text-red-600"> 系统管理员，可以管理所有数据</span></div>
            <div className="p-3 bg-purple-50 rounded"><span className="font-medium text-purple-700">manager（管理者）：</span><span className="text-purple-600"> 可以看所有账号、复盘、线索</span></div>
            <div className="p-3 bg-blue-50 rounded"><span className="font-medium text-blue-700">operator（运营）：</span><span className="text-blue-600"> 可以管理选题、脚本、发布、复盘、线索</span></div>
            <div className="p-3 bg-green-50 rounded"><span className="font-medium text-green-700">sales（销售）：</span><span className="text-green-600"> 可以查看和跟进分配给自己的线索</span></div>
            <div className="p-3 bg-gray-50 rounded"><span className="font-medium text-gray-700">viewer（只读）：</span><span className="text-gray-600"> 只读角色</span></div>
          </div>
        </div>
      )}

      {activeTab === 'dicts' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">字典管理</h3>
          <p className="text-sm text-gray-500">以下字典项已在系统中配置：</p>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-gray-50 rounded">
              <p className="font-medium text-gray-700">内容类型</p>
              <p className="text-xs text-gray-500 mt-1">产品展示、工艺讲解、案例分析、问答解惑、工厂实拍、行业观点、教程指南</p>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <p className="font-medium text-gray-700">需求类型</p>
              <p className="text-xs text-gray-500 mt-1">花膜、加工、设备、工艺咨询、不明确</p>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <p className="font-medium text-gray-700">知识分类</p>
              <p className="text-xs text-gray-500 mt-1">公司介绍、工艺知识、材料适配、产品设备、客户FAQ、人设指南、爆款拆解、复盘案例、线索话术、风险规则</p>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <p className="font-medium text-gray-700">线索等级</p>
              <p className="text-xs text-gray-500 mt-1">A-高价值、B-中价值、C-待观察、D-低价值</p>
            </div>
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
              <div className="space-y-2">
                <div className="p-2 bg-green-50 rounded">
                  <p className="text-xs text-green-700 font-medium">个人号接入（免费）</p>
                  <p className="text-xs text-green-600 mt-0.5">身份证实名即可，无需营业执照。基础数据接口（播放量、互动数据）可用。</p>
                </div>
                <div className="p-2 bg-blue-50 rounded">
                  <p className="text-xs text-blue-700 font-medium">企业号接入（¥300/年认证费）</p>
                  <p className="text-xs text-blue-600 mt-0.5">需要营业执照，调用频率更高，评论内容等接口权限更完整。</p>
                </div>
              </div>
              <p className="text-gray-500 mt-3 mb-1.5">接入步骤：</p>
              <ol className="list-decimal ml-4 space-y-1 text-gray-600 text-xs">
                <li>打开 <a href="https://open.weixin.qq.com" target="_blank" className="text-blue-600">微信开放平台</a> 注册开发者账号</li>
                <li>个人选择「个人开发者」实名认证（免费），企业选择「企业开发者」认证</li>
                <li>创建应用，获取 AppID 和 AppSecret</li>
                <li>在开放平台「视频号」管理中绑定实际的视频号</li>
                <li>获取 access_token，配置到 <code className="bg-gray-200 px-1 rounded">.env.local</code></li>
              </ol>
            </div>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">抖音开放平台接入</h3>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-3 h-3 rounded-full bg-gray-300"></span>
              <span className="text-sm text-gray-600">未连接</span>
              <span className="text-xs text-gray-400 ml-1">（需抖音开放平台账号）</span>
            </div>
            <div className="bg-gray-50 rounded p-3 text-sm">
              <p className="text-gray-500 mb-2">接入步骤：</p>
              <ol className="list-decimal ml-4 space-y-1 text-gray-600 text-xs">
                <li>在抖音开放平台注册开发者账号</li>
                <li>创建应用，获取 client_key / client_secret</li>
                <li>配置 <code className="bg-gray-200 px-1 rounded">.env.local</code> 中的 DOUYIN_* 环境变量</li>
              </ol>
            </div>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">视频号内容自动拉取</h3>
            <p className="text-sm text-gray-500 mb-3">配置好上述平台连接后，可定时拉取视频数据并自动填充到系统的数据复盘模块。</p>
            <p className="text-xs text-gray-400">当前版本：数据通过手动录入 + CSV导入 + AI生成。平台API对接将在第二期实现。</p>
          </div>
        </div>
      )}
      {activeTab === 'csv' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">CSV导入模板</h3>
          <p className="text-sm text-gray-500 mb-3">CSV导入功能将在后续版本实现。以下为支持的导入类型：</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 border border-gray-200 rounded">账号导入</div>
            <div className="p-3 border border-gray-200 rounded">选题导入</div>
            <div className="p-3 border border-gray-200 rounded">已发布视频导入</div>
            <div className="p-3 border border-gray-200 rounded">视频数据导入</div>
            <div className="p-3 border border-gray-200 rounded">线索导入</div>
            <div className="p-3 border border-gray-200 rounded">知识卡导入</div>
            <div className="p-3 border border-gray-200 rounded">爆款拆解导入</div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
