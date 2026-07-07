'use client';
import { formatDateTime } from '@/lib/utils';
import type { KnowledgeCardNew } from '@/lib/constants/types';

interface KnowledgeDrawerProps {
  card: KnowledgeCardNew | null;
  onClose: () => void;
  onAction: (card: KnowledgeCardNew, action: string) => void;
  accountName: (id: string | null) => string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="text-xs">
      <span className="text-gray-400">{label}：</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}

function Pill({ text, color }: { text: string; color: string }) {
  const c: Record<string, string> = {
    green: 'bg-green-100 text-green-700', yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700', red: 'bg-red-100 text-red-600',
    gray: 'bg-gray-100 text-gray-500', purple: 'bg-purple-100 text-purple-600',
  };
  return <span className={'inline-block px-1.5 py-0.5 rounded text-[10px] ' + (c[color] || c.gray)}>{text}</span>;
}

export default function KnowledgeDrawer({ card, onClose, onAction, accountName }: KnowledgeDrawerProps) {
  if (!card) return null;

  const actions = [
    ['生成选题', '生成选题', 'blue'], ['生成脚本', '生成脚本', 'blue'],
    ['风险检查', '风险检查', 'red'], ['改可对外', '可对外', 'green'],
    ['完善内容', '完善', 'gray'], ['老板口吻', '老板口吻', 'purple'],
  ];

  return (
    <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-10">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-800 truncate">{card.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Pill text={card.content_scope} color={card.content_scope === '可对外' ? 'green' : card.content_scope === '可模糊对外' ? 'yellow' : card.content_scope === '禁止对外' ? 'red' : 'gray'} />
              <Pill text={card.knowledge_status} color={card.knowledge_status === '已确认' ? 'green' : card.knowledge_status === '待审核' ? 'yellow' : card.knowledge_status === '需更新' ? 'red' : 'gray'} />
              <span className="text-[10px] text-gray-400">{card.card_type} · v{card.version}</span>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl ml-4 flex-shrink-0" onClick={onClose}>✕</button>
        </div>

        <div className="p-6 space-y-4">

          {/* === AI Quick Actions === */}
          <Section title="AI生成（一键执行）">
            <div className="grid grid-cols-3 gap-2">
              {actions.map(([label, action, color]) => (
                <button key={label}
                  className={'text-xs px-2 py-1.5 rounded border text-center ' + (
                    color === 'blue' ? 'border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100' :
                    color === 'red' ? 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100' :
                    color === 'green' ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100' :
                    color === 'purple' ? 'border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100' :
                    'border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100'
                  )}
                  onClick={() => onAction(card, action)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* === Core Conclusion === */}
          <Section title="核心结论">
            <p className="text-xs text-gray-700 leading-relaxed">{card.core_conclusion || card.summary || '未填写'}</p>
            {card.suitable_scenarios && <p className="text-[10px] text-green-600 mt-1">✅ 适合：{card.suitable_scenarios}</p>}
            {card.unsuitable_scenarios && <p className="text-[10px] text-red-500 mt-0.5">⚠ 不适合：{card.unsuitable_scenarios}</p>}
            {card.key_judgement_points && <p className="text-[10px] text-blue-600 mt-0.5">🔍 判断重点：{card.key_judgement_points}</p>}
          </Section>

          {/* === 新媒体表达 === */}
          {(card.video_channel_expression || card.douyin_expression || card.new_media_expression) && (
            <Section title="新媒体表达方式">
              {card.video_channel_expression && <Row label="视频号" value={card.video_channel_expression} />}
              {card.douyin_expression && <Row label="抖音" value={card.douyin_expression} />}
              {card.new_media_expression && <Row label="通用" value={card.new_media_expression} />}
              {card.unsuitable_expression && <p className="text-[10px] text-red-500 mt-1">不适合：{card.unsuitable_expression}</p>}
            </Section>
          )}

          {/* === Tone Versions === */}
          {(card.boss_tone_expression || card.technical_tone_expression || card.qa_tone_expression) && (
            <Section title="语气版本">
              {card.boss_tone_expression && <Row label="老板口吻" value={card.boss_tone_expression} />}
              {card.technical_tone_expression && <Row label="技术口吻" value={card.technical_tone_expression} />}
              {card.qa_tone_expression && <Row label="问答口吻" value={card.qa_tone_expression} />}
            </Section>
          )}

          {/* === Risk & Safety === */}
          <Section title="风险表达">
            {card.forbidden_expressions && <p className="text-[10px] text-red-600">🚫 禁止：{card.forbidden_expressions}</p>}
            {card.risky_expressions && <p className="text-[10px] text-orange-500 mt-1">⚠ 风险：{card.risky_expressions}</p>}
            {card.safer_alternatives && <p className="text-[10px] text-green-600 mt-1">✅ 替代：{card.safer_alternatives}</p>}
            {card.needs_human_review && <p className="text-[10px] text-red-500 mt-1">需要人工确认</p>}
            {!card.forbidden_expressions && !card.risky_expressions && <p className="text-[10px] text-gray-400">未填写风险信息</p>}
          </Section>

          {/* === Customer FAQ === */}
          {(card.customer_questions || card.standard_replies || card.required_followup_info) && (
            <Section title="客户FAQ">
              {card.customer_questions && <Row label="常见问题" value={card.customer_questions} />}
              {card.standard_replies && <Row label="标准回复" value={card.standard_replies} />}
              {card.required_followup_info && <Row label="需要追问" value={card.required_followup_info} />}
              {card.can_send_to_customer !== undefined && (
                <p className="text-[10px] mt-1">{card.can_send_to_customer ? '✅ 可直接发给客户' : '⚠ 不建议直接发给客户'}</p>
              )}
            </Section>
          )}

          {/* === Topic & Script Ideas */}
          {(card.topic_ideas || card.script_angles) && (
            <Section title="可生成内容">
              {card.topic_ideas && <Row label="选题角度" value={card.topic_ideas} />}
              {card.script_angles && <Row label="脚本角度" value={card.script_angles} />}
              <div className="flex gap-2 mt-2">
                <button className="btn-primary btn-sm text-xs" onClick={() => onAction(card, '生成选题')}>生成选题</button>
                <button className="btn-primary btn-sm text-xs" onClick={() => onAction(card, '生成脚本')}>生成脚本</button>
              </div>
            </Section>
          )}

          {/* === Linked Content === */}
          {(card.linked_topic_ids.length > 0 || card.linked_script_ids.length > 0) && (
            <Section title="关联内容">
              <div className="space-y-1">
                {card.linked_topic_ids.length > 0 && <Row label="关联选题" value={card.linked_topic_ids.length + '个'} />}
                {card.linked_script_ids.length > 0 && <Row label="关联脚本" value={card.linked_script_ids.length + '个'} />}
                {card.generated_topics_count > 0 && <Row label="生成选题数" value={String(card.generated_topics_count)} />}
                {card.generated_scripts_count > 0 && <Row label="生成脚本数" value={String(card.generated_scripts_count)} />}
              </div>
            </Section>
          )}

          {/* === Usage Stats === */}
          <Section title="使用数据">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-gray-50 rounded p-2">
                <p className="font-bold">{card.usage_count}</p>
                <p className="text-[10px] text-gray-400">引用次数</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="font-bold">{card.generated_topics_count}</p>
                <p className="text-[10px] text-gray-400">生成选题</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="font-bold">{card.generated_scripts_count}</p>
                <p className="text-[10px] text-gray-400">生成脚本</p>
              </div>
            </div>
          </Section>

          {/* === Metadata === */}
          <Section title="元信息">
            <div className="grid grid-cols-2 gap-1">
              <Row label="知识卡 ID" value={card.id.slice(0, 10)} />
              <Row label="分类" value={card.category} />
              <Row label="卡类型" value={card.card_type} />
              <Row label="版本" value={'v' + card.version} />
              <Row label="负责人" value={accountName(card.owner_id)} />
              <Row label="创建时间" value={formatDateTime(card.created_at)} />
              {card.updated_at && <Row label="最后更新" value={formatDateTime(card.updated_at)} />}
              {card.last_used_at && <Row label="最后使用" value={formatDateTime(card.last_used_at)} />}
              {card.tags.length > 0 && <Row label="标签" value={card.tags.slice(0, 5).join(', ')} />}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
