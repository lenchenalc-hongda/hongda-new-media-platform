'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';

const REVIEW_TYPES = [
  {
    type: 'A',
    title: '大货前异常 / 订单流失 / 客户信任受损',
    desc: '用于复盘客户需求、方案判断、设计制版、打样、技术响应、客户信任以及订单流失等大货前异常。',
  },
  {
    type: 'B',
    title: '大货生产 / 品质 / 交付异常',
    desc: '用于复盘生产过程中出现的工艺、次品、品质、返工、延期、补货、客诉及交付异常。',
  },
  {
    type: 'C',
    title: '前端问题延伸至大货的综合异常',
    desc: '用于复盘前端判断或验证不足，在后续大货生产阶段集中爆发的问题。',
  },
];

export default function NewReviewPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <AppLayout>
      <PageHeader title="新建项目复盘" description="选择复盘类型，正式表单将在下一阶段开放。" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REVIEW_TYPES.map(item => (
          <button
            key={item.type}
            onClick={() => setSelected(item.type)}
            className={`card text-left hover:shadow-md transition-shadow ${selected === item.type ? 'ring-2 ring-blue-500' : ''}`}
          >
            <p className="text-sm font-bold text-blue-600 mb-1">{item.type}类 · {item.title}</p>
            <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          已选择 {selected} 类。正式复盘表单将在下一阶段开放。
        </div>
      )}
    </AppLayout>
  );
}
