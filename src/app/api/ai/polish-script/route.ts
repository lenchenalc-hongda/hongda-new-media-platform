// POST /api/ai/polish-script
// 润色脚本：去AI味、去废话、加口语

import { NextRequest, NextResponse } from 'next/server';
import { removeAiTone } from '@/lib/ai/script-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { script } = body;

    if (!script) {
      return NextResponse.json({ error: '缺少 script 参数' }, { status: 400 });
    }

    // 1. Remove AI tone & forbidden phrases
    const cleaned = removeAiTone(script);

    // 2. Check if anything was removed
    const changes: string[] = [];
    if (cleaned.length < script.length) {
      changes.push('删除了冗余表达');
    }
    if (cleaned !== script) {
      changes.push('删除了禁止表达短语');
    }

    // 3. Shorten long lines (> 40 chars per line)
    const lines = cleaned.split('\n').map(l => {
      const trimmed = l.trim();
      if (trimmed.length > 40) {
        // Try to split at punctuation
        const splitIdx = trimmed.slice(0, 30).lastIndexOf('。');
        if (splitIdx > 5) {
          changes.push('拆分长句');
          return trimmed.slice(0, splitIdx + 1) + '\n' + trimmed.slice(splitIdx + 1);
        }
      }
      return trimmed;
    });

    const polishedScript = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    if (changes.length === 0) {
      changes.push('脚本已符合标准，无需修改');
    }

    return NextResponse.json({ polishedScript, changes });
  } catch (err: any) {
    console.error('[polish-script] Error:', err.message);
    return NextResponse.json({ error: 'Failed to polish script' }, { status: 500 });
  }
}
