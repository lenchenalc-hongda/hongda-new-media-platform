'use client';
import React, { useMemo } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { getStoredData, STORAGE_KEYS } from '@/lib/storage';
import {
  TOPIC_CONTENT_TYPES, TOPIC_SOURCE_OPTIONS, TOPIC_STATUSES_NEW,
  TOPIC_SCRIPT_STATUSES, TOPIC_PRIORITIES_NEW, TOPIC_PLATFORMS,
  CONVERSION_GOALS, SHOOTING_METHODS, TOPIC_GENERATE_TYPES
} from '@/lib/constants';
import {
  getContentTypeLabel, truncate, formatDate, formatDateTime,
  getPlatformLabel, getStatusBadgeClass, getStatusLabel
} from '@/lib/utils';
import type { Topic } from '@/lib/constants/types';

const QUALITY_DIMENSIONS_CN = [
  { key: 'customer_pain', label: '客户痛点明确度', max: 20 },
  { key: 'account_match', label: '账号匹配度', max: 15 },
  { key: 'business_value', label: '业务转化价值', max: 20 },
  { key: 'new_media', label: '新媒体传播性', max: 15 },
  { key: 'shootable', label: '拍摄可执行性', max: 10 },
  { key: 'knowledge', label: '知识库支撑度', max: 10 },
  { key: 'risk', label: '风险可控性', max: 10 },
];

export default function DetailContent(p: any) {
  // Load scripts from localStorage (not just static mock data)
  const liveScripts = useMemo(() => getStoredData<any>(STORAGE_KEYS.SCRIPTS, []), []);
  const linkedScript = p.detailTopic?.linked_script_id
    ? liveScripts.find((s: any) => s.id === p.detailTopic.linked_script_id)
    : null;

  return (
    <div className="fixed inset-0 bg-black/20 z-40" onClick={() => p.setDetailTopic(null)}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Close */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-10">
          <h3 className="font-semibold text-gray-800 truncate max-w-md">{p.detailTopic.title}</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => p.setDetailTopic(null)}>✕</button>
        </div>

        <div className="p-6 space-y-6">
          {/* 1. Basic Info */}
          <Section title="基础信息">
            <InfoGrid items={[
              ['选题 ID', p.detailTopic.id],
              ['所属账号', p.getAccountName(p.detailTopic.account_id)],
              ['平台', p.detailTopic.platform || '-'],
              ['内容类型', p.detailTopic.content_type],
              ['选题来源', p.detailTopic.topic_source || '-'],
              ['优先级', <StatusBadge key="p" status={p.detailTopic.priority} />],
              ['选题状态', <StatusBadge key="st" status={p.detailTopic.status} />],
              ['脚本状态', <StatusBadge key="ss" status={p.detailTopic.script_status || '未生成'} />],
              ['创建时间', formatDateTime(p.detailTopic.created_at)],
              ['更新时间', formatDateTime(p.detailTopic.updated_at)],
            ]} />
          </Section>

          {/* 1b. Linked Script Content — right after basic info */}
          {linkedScript && (
            <Section title="关联脚本内容">
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">脚本标题</p>
                  <p className="text-gray-800 font-medium">{linkedScript.title}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">前3秒钩子</p>
                  <p className="text-gray-800 bg-yellow-50 p-2 rounded text-sm">{linkedScript.hook || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">完整口播</p>
                  <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 whitespace-pre-wrap">{linkedScript.main_script || '-'}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mt-1">
                  {linkedScript.cover_text && <div><span className="text-gray-400">封面标题：</span>{linkedScript.cover_text}</div>}
                  {linkedScript.comment_reply && <div><span className="text-gray-400">评论区引导：</span>{linkedScript.comment_reply}</div>}
                  {linkedScript.private_message_cta && <div className="col-span-2"><span className="text-gray-400">私信承接话术：</span>{linkedScript.private_message_cta}</div>}
                  {linkedScript.risk_notes && <div className="col-span-2"><span className="text-gray-400">风险提醒：</span>{linkedScript.risk_notes}</div>}
                </div>
              </div>
            </Section>
          )}

          {/* 2. Planning Info */}
          <Section title="选题策划信息">
            <InfoGrid items={[
              ['目标客户', p.detailTopic.target_customer || p.detailTopic.target_audience || '-'],
              ['客户痛点', p.detailTopic.customer_pain || '-'],
              ['产品/工艺', p.detailTopic.product_process || p.detailTopic.product_or_process || '-'],
              ['材料', p.detailTopic.material || '-'],
              ['内容角度', p.detailTopic.content_angle || '-'],
              ['核心观点', p.detailTopic.core_point || '-'],
              ['用户为什么愿意看', p.detailTopic.why_user_watch || '-'],
              ['解决客户什么问题', p.detailTopic.content_purpose || '-'],
            ]} />
          </Section>

          {/* 3. Conversion Design */}
          <Section title="转化设计">
            <InfoGrid items={[
              ['内容目的', p.detailTopic.content_purpose || '-'],
              ['转化目标', p.detailTopic.conversion_goal || '-'],
              ['评论区引导', p.detailTopic.comment_guidance || '-'],
              ['私信承接动作', p.detailTopic.private_message_action || '-'],
              ['希望客户提供什么信息', p.detailTopic.required_customer_info || '-'],
              ['引导免费打样', p.detailTopic.sample_guidance || '-'],
            ]} />
          </Section>

          {/* 4. Shootability */}
          <Section title="拍摄可执行性">
            <InfoGrid items={[
              ['建议出镜方式', p.detailTopic.shooting_method || '-'],
              ['建议视频时长', p.detailTopic.video_length || '-'],
              ['需要准备的产品', p.detailTopic.required_products || '-'],
              ['需要拍摄的画面', p.detailTopic.required_shots || '-'],
              ['需要车间/设备素材', p.detailTopic.required_factory_assets || '-'],
              ['需要案例图片', p.detailTopic.required_case_images || '-'],
              ['涉及客户Logo', p.detailTopic.logo_risk || '否'],
              ['隐私/授权风险', p.detailTopic.privacy_risk || '无'],
            ]} />
          </Section>

          {/* 5. Knowledge References */}
          <Section title="知识库依据">
            <InfoGrid items={[
              ['参考知识卡', p.detailTopic.knowledge_refs || '-'],
              ['参考FAQ', p.detailTopic.faq_refs || '-'],
              ['参考案例', p.detailTopic.case_refs || '-'],
              ['参考爆款', p.detailTopic.viral_refs || '-'],
              ['参考历史复盘', p.detailTopic.review_refs || '-'],
              ['风险规则', p.detailTopic.risk_rules || '-'],
            ]} />
          </Section>

          {/* 6. Post-publish Review */}
          <Section title="发布后复盘关联">
            <InfoGrid items={[
              ['关联脚本', p.detailTopic.linked_script_id ? '已关联' : '未关联'],
              ['关联视频', p.detailTopic.linked_post_id ? '已发布' : '未发布'],
            ]} />
          </Section>

          {/* AI Score */}
          {p.detailTopic.topic_score != null && (
            <Section title={'AI选题评分：' + p.detailTopic.topic_score + '/100'}>
              <div className="space-y-2">
                <div className={'text-sm font-medium px-2 py-0.5 rounded-full inline-block ' + (p.detailTopic.topic_score >= 80 ? 'bg-green-100 text-green-800' : p.detailTopic.topic_score >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800')}>
                  {p.detailTopic.topic_score >= 80 ? '✅ 建议拍摄' : p.detailTopic.topic_score >= 60 ? '⚠️ 需优化后拍摄' : '❌ 不建议'}
                </div>
              </div>
            </Section>
          )}

          {/* AI Operations */}
          <Section title="AI操作">
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                ['AI选题评分', () => p.setShowAiResult({ '评分': '建议拍摄', '得分': '85/100' })],
                ['AI优化标题', () => p.setShowAiResult({ '原标题': p.detailTopic.title, '优化建议': '更具体、更有冲突感' })],
                ['生成脚本大纲', () => p.setShowAiResult({ '大纲': '开头钩子→抛出问题→分析原因→给出方法→引导互动' })],
                ['生成完整脚本', () => p.handleConvertToScript(p.detailTopic)],
                ['生成封面文案', () => p.setShowAiResult({ '封面': '留白+大字+产品图' })],
                ['生成评论区引导', () => p.setShowAiResult({ '引导': '你觉得呢？评论区说说你的产品情况。' })],
                ['生成私信话术', () => p.setShowAiResult({ '话术': '发产品图片，免费评估工艺。' })],
                ['生成拍摄清单', () => p.setShowAiResult({ '清单': '产品样品、打样板、对比案例' })],
                ['AI检查风险', () => p.setShowAiResult({ '风险等级': '低', '风险点': '无重大风险' })],
              ].map(([label, onClick]) => (
                <button key={label as string} className="btn-secondary btn-sm text-xs" onClick={onClick as any}>
                  {label as string}
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-lg p-4">
      <h4 className="font-medium text-sm text-gray-700 mb-3">{title}</h4>
      {children}
    </div>
  );
}

function InfoGrid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {items.map(([k, v]) => (
        <div key={k} className="text-sm">
          <span className="text-gray-400">{k}：</span>
          <span className="text-gray-700">{v}</span>
        </div>
      ))}
    </div>
  );
}
