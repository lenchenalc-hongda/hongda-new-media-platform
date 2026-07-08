'use client';
import StatusBadge from '@/components/ui/StatusBadge';
import { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { Topic, Script } from '@/lib/constants/types';

interface TopicDrawerProps {
  topic: Topic | null;
  onClose: () => void;
  onConvertToScript: (t: Topic) => void;
  onUpdateStatus: (topicId: string, newStatus: string) => void;
  accounts: typeof MOCK_ACCOUNTS;
  scripts: Script[];
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-xs text-gray-700 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function StatusBadgeSmall({ label, color }: { label: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700', yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700', purple: 'bg-purple-100 text-purple-700',
    red: 'bg-red-100 text-red-600', gray: 'bg-gray-100 text-gray-500',
  };
  return <span className={'inline-block px-2 py-0.5 rounded text-[10px] font-medium ' + (colors[color] || colors.gray)}>{label}</span>;
}

export default function TopicDrawer({ topic, onClose, onConvertToScript, onUpdateStatus, accounts, scripts }: TopicDrawerProps) {
  if (!topic) return null;

  const account = accounts.find(a => a.id === topic.account_id);
  const linkedScript = topic.linked_script_id
    ? scripts.find(s => s.id === topic.linked_script_id)
    : null;

  // Status progression map
  const STATUS_NEXT: Record<string, string> = {
    '待审核': '已审核',
    '已审核': '已发布',
    '已发布': '待复盘',
    '待复盘': '可复制',
  };
  const STATUS_ACTIONS: Record<string, { label: string; color: string }> = {
    '待审核': { label: '审核通过 → 已审核', color: 'green' },
    '已审核': { label: '标记发布 → 已发布', color: 'green' },
    '已发布': { label: '开始复盘 → 待复盘', color: 'yellow' },
    '待复盘': { label: '标记可复制 → 可复制', color: 'purple' },
  };
  const nextAction = STATUS_ACTIONS[topic.status];
  const nextStatus = STATUS_NEXT[topic.status];

  return (
    <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-10">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-800 truncate">{topic.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadgeSmall label={topic.status} color={
                topic.status === '已审核' || topic.status === '已发布' || topic.status === '可复制' ? 'green' :
                topic.status === '待审核' || topic.status === '待复盘' ? 'yellow' : 'gray'
              } />
              <span className="text-[10px] text-gray-400">{account?.name || '-'} · {topic.platform || '-'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {nextAction && (
              <button className={'btn-sm text-xs px-3 py-1 rounded font-medium text-white ' + (nextAction.color === 'green' ? 'bg-green-600 hover:bg-green-700' : nextAction.color === 'yellow' ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-purple-600 hover:bg-purple-700')}
                onClick={() => onUpdateStatus(topic.id, nextStatus)}>
                {nextAction.label}
              </button>
            )}
            <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* ===== LINKED SCRIPT — TOP PRIORITY ===== */}
          {linkedScript && (
            <SectionCard title="关联脚本内容">
              <div className="space-y-2">
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-xs font-medium text-gray-800">{linkedScript.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">v{linkedScript.version} · {linkedScript.status}</p>
                </div>
                {linkedScript.hook && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                    <p className="text-[10px] text-yellow-700 font-medium mb-0.5">前3秒钩子</p>
                    <p className="text-xs text-yellow-800">{linkedScript.hook}</p>
                  </div>
                )}
                {linkedScript.main_script && (
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium mb-0.5">完整口播</p>
                    <div className="bg-gray-50 p-3 rounded text-xs text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">{linkedScript.main_script}</div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 mt-1">
                  {linkedScript.cover_text && <div><span className="text-gray-400">封面：</span>{linkedScript.cover_text}</div>}
                  {linkedScript.subtitle_points && <div className="col-span-2"><span className="text-gray-400">字幕重点：</span>{linkedScript.subtitle_points}</div>}
                  {linkedScript.comment_reply && <div className="col-span-2"><span className="text-gray-400">评论区引导：</span>{linkedScript.comment_reply}</div>}
                  {linkedScript.private_message_cta && <div className="col-span-2"><span className="text-gray-400">私信承接话术：</span>{linkedScript.private_message_cta}</div>}
                  {linkedScript.risk_notes && <div className="col-span-2"><span className="text-gray-400">风险提醒：</span>{linkedScript.risk_notes}</div>}
                </div>
              </div>
            </SectionCard>
          )}

          {/* ===== WHY THIS TOPIC ===== */}
          <SectionCard title="为什么做这个选题">
            <div className="grid grid-cols-2 gap-3">
              <Field label="客户痛点" value={topic.customer_pain || '未填写'} />
              <Field label="目标客户" value={topic.target_customer || '未填写'} />
              <Field label="核心观点" value={topic.core_point || '未填写'} />
              <Field label="用户为什么愿意看" value={topic.why_user_watch || '未填写'} />
              <Field label="内容目的" value={topic.content_purpose || '未填写'} />
              <Field label="内容角度" value={topic.content_angle || '未填写'} />
            </div>
          </SectionCard>

          {/* ===== CONVERSION ===== */}
          <SectionCard title="转化设计">
            <div className="grid grid-cols-2 gap-3">
              <Field label="转化目标" value={topic.conversion_goal || '未填写'} />
              <Field label="评论区引导" value={topic.comment_guidance || '未填写'} />
              <Field label="私信承接动作" value={topic.private_message_action || '未填写'} />
              <Field label="希望客户提供什么信息" value={topic.required_customer_info || '未填写'} />
              <Field label="是否需要引导打样" value={topic.sample_guidance || '未填写'} />
            </div>
          </SectionCard>

          {/* ===== SHOOTING ===== */}
          <SectionCard title="拍摄信息">
            <div className="grid grid-cols-2 gap-3">
              <Field label="建议出镜方式" value={topic.shooting_method || '未设置'} />
              <Field label="建议视频时长" value={topic.video_length ? topic.video_length + '秒' : '未设置'} />
              <Field label="需要准备的产品" value={topic.required_products || '未填写'} />
              <Field label="需要拍摄的画面" value={topic.required_shots || '未填写'} />
              <Field label="需要工厂/设备素材" value={topic.required_factory_assets || '未填写'} />
              <Field label="需要案例图片" value={topic.required_case_images || '未填写'} />
            </div>
            {(topic.logo_risk || topic.privacy_risk) && (
              <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded p-2 text-[10px] text-yellow-700">
                {topic.logo_risk && <p>⚠ 涉及客户Logo风险：{topic.logo_risk}</p>}
                {topic.privacy_risk && <p>⚠ 隐私风险：{topic.privacy_risk}</p>}
              </div>
            )}
          </SectionCard>

          {/* ===== STATUS + FLOW ===== */}
          <SectionCard title="状态流转">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="bg-gray-50 rounded p-2 text-center">
                <p className="text-[10px] text-gray-400">选题状态</p>
                <p className="text-sm font-bold mt-0.5">{topic.status}</p>
              </div>
              <div className="bg-gray-50 rounded p-2 text-center">
                <p className="text-[10px] text-gray-400">脚本状态</p>
                <p className="text-sm font-bold mt-0.5">{topic.script_status}</p>
              </div>
              <div className="bg-gray-50 rounded p-2 text-center">
                <p className="text-[10px] text-gray-400">关联脚本</p>
                <p className="text-sm font-bold mt-0.5">{topic.linked_script_id ? '已关联' : '无'}</p>
              </div>
            </div>
            <Field label="最后动作" value={topic.last_action || '暂无'} />
            {topic.is_this_week && (
              <div className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded mt-1">
                📅 本周计划选题
                {topic.planned_shoot_date && <span>· 拍摄：{formatDate(topic.planned_shoot_date)}</span>}
                {topic.planned_publish_date && <span>· 发布：{formatDate(topic.planned_publish_date)}</span>}
              </div>
            )}
          </SectionCard>

          {/* ===== METADATA ===== */}
          <SectionCard title="元信息">
            <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-400">
              <span>创建时间：{formatDateTime(topic.created_at)}</span>
              <span>选题 ID：{topic.id.slice(0, 10)}</span>
              <span>来源：{topic.topic_source || '-'}</span>
              {topic.topic_score != null && <span>AI评分：{topic.topic_score}/100</span>}
              {topic.risk_level && <span>风险等级：{topic.risk_level}</span>}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
