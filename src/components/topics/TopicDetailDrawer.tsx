'use client';
import React from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import { MOCK_ACCOUNTS, ALL_MOCK_SCRIPTS } from '@/lib/constants/mock-data';
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
import DetailContent from './DetailContent';

interface TopicDetailDrawerProps {
  detailTopic: Topic | null;
  setDetailTopic: (t: Topic | null) => void;
  topics: Topic[];
  setTopics: (f: any) => void;
  editingTopic: Partial<Topic>;
  setEditingTopic: (t: any) => void;
  showAiResult: any;
  setShowAiResult: (r: any) => void;
  aiResult: any;
  setAiResult: (r: any) => void;
  wizardData: Record<string, any>;
  setWizardData: (d: any) => void;
  setShowAiWizard: (s: boolean) => void;
  getAccountName: (id: string | null) => string;
  handleConvertToScript: (t: Topic) => void;
  handleSaveTopic: () => void;
  handleGenerateFromWizard: () => void;
}

const QUALITY_DIMENSIONS_CN = [
  { key: 'customer_pain', label: '客户痛点明确度', max: 20 },
  { key: 'account_match', label: '账号匹配度', max: 15 },
  { key: 'business_value', label: '业务转化价值', max: 20 },
  { key: 'new_media', label: '新媒体传播性', max: 15 },
  { key: 'shootable', label: '拍摄可执行性', max: 10 },
  { key: 'knowledge', label: '知识库支撑度', max: 10 },
  { key: 'risk', label: '风险可控性', max: 10 },
];

// ---------- Pure Render Function ----------



export default function TopicDetailDrawer(p: TopicDetailDrawerProps) {
  const { detailTopic } = p;
  if (!detailTopic) return null;
  return <DetailContent {...p} />;
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
