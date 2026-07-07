import { NextRequest, NextResponse } from 'next/server';
import { MOCK_OA_TEMPLATES } from '@/lib/constants/oa-mock-data';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { template_id, body_blocks } = body;
  const template = MOCK_OA_TEMPLATES.find(t => t.id === template_id) || MOCK_OA_TEMPLATES[0];

  const blocks = body_blocks || [];
  const html = `
    <div style="max-width:680px;margin:0 auto;font-family:-apple-system,'Noto Sans SC',sans-serif;padding:20px;line-height:1.8;color:#333;">
      ${blocks.map((b: any) => {
        if (b.type === 'title') return `<h1 style="font-size:22px;font-weight:700;margin:20px 0 10px;">${b.content}</h1>`;
        if (b.type === 'subtitle') return `<p style="font-size:14px;color:#888;margin:0 0 20px;">${b.content}</p>`;
        if (b.type === 'paragraph') return `<p style="font-size:15px;margin:12px 0;">${b.content}</p>`;
        if (b.type === 'quote') return `<blockquote style="border-left:4px solid #2563eb;padding:10px 16px;margin:16px 0;background:#f0f7ff;font-size:15px;color:#1e40af;">${b.content}</blockquote>`;
        if (b.type === 'tip') return `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;color:#92400e;">💡 ${b.content}</div>`;
        if (b.type === 'cta') return `<div style="background:#2563eb;color:white;border-radius:8px;padding:16px;margin:24px 0;text-align:center;font-size:15px;font-weight:500;">${b.content}</div>`;
        if (b.type === 'image') return b.caption ? `<figure style="margin:16px 0;"><div style="background:#e5e7eb;height:200px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9ca3af;">📷 ${b.caption}</div><figcaption style="font-size:12px;color:#888;margin-top:6px;text-align:center;">${b.caption}</figcaption></figure>` : '';
        return `<p style="margin:8px 0;">${b.content}</p>`;
      }).join('\n')}
      <div style="margin-top:30px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#aaa;text-align:center;">
        <p>宏达印业 · 热转印方案专家</p>
        <p>本文由宏达新媒体作战中台生成 · 引用自知识库</p>
      </div>
    </div>`;

  return NextResponse.json({ html, template_name: template.name, blocks_count: blocks.length });
}
