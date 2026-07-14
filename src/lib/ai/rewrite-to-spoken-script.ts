// ===== rewriteToSpokenScript =====
// Replaces removeAiTone() — restructures text into spoken, short-line form
// rather than only deleting banned phrases.
// Enforces: <=30 chars per line, duration-based word limits, no filler

export interface SpeakRewriteInput {
  script: string;
  hook?: string;
  duration: '15' | '30' | '60';
  accountPersona?: string;
  knowledgeCards?: any[];
}

export interface SpeakRewriteResult {
  script: string;
  hook: string;
  wordCount: number;
  lineCount: number;
  lines: string[];
  changes: string[];
  enforcements: string[];
}

const WORD_LIMITS: Record<string, number> = { '15': 100, '30': 150, '60': 420 };

const FORBIDDEN_FILLER = [
  '很多客户问我这个问题', '今天统一回答一下', '今天给大家讲一下',
  '最近很多朋友问', '大家都知道', '在热转印行业中', '随着市场发展',
  '首先', '其次', '最后', '综上所述', '显而易见', '有效提升',
  '赋能', '助力', '专业解决方案', '欢迎联系我们', '一站式', '全方位',
  '闭环', '矩阵', '在这个视频里', '今天在视频里',
];

function countChars(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}

function removeFiller(text: string): string {
  let result = text;
  FORBIDDEN_FILLER.forEach(p => {
    result = result.split(p).join('');
  });
  result = result.replace(/\s{2,}/g, ' ').replace(/\n{2,}/g, '\n').trim();
  return result;
}

function removeEnumeration(text: string): string {
  let result = text;
  ['第一', '第二', '第三', '第四', '第五'].forEach(pt => {
    result = result.replace(new RegExp(pt + '[\uff0c,\u3001]?\\s*', 'g'), '');
  });
  return result;
}

function splitIntoSpokenLines(text: string): string[] {
  const paragraphs = text.split('\n').filter(p => p.trim().length > 0);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const t = para.trim();
    if (t.length <= 30) { lines.push(t); continue; }
    const segs: string[] = [];
    let cur = '';
    for (const ch of [...t]) {
      cur += ch;
      if (cur.length >= 25 && (ch === '\uff0c' || ch === ',' || ch === '\u3002' || ch === '.')) {
        segs.push(cur.trim()); cur = '';
      }
    }
    if (cur.trim()) segs.push(cur.trim());
    for (const s of segs) {
      if (s.length <= 30) lines.push(s);
      else { for (let i = 0; i < s.length; i += 28) lines.push(s.slice(i, i + 28)); }
    }
  }
  return lines.filter((l, i) => i === 0 || l !== lines[i-1]);
}

const SPOKEN_FILLER = ['我跟你说', '讲真', '说白了', '其实', '你看', '就是'];

function applyPersonaTone(lines: string[], persona?: string): string[] {
  if (!persona || persona === '老板') return lines;
  // Remove existing filler words first
  let result = lines.map(line => {
    let l = line;
    for (const f of SPOKEN_FILLER) {
      l = l.split(f + '，').join('').split(f).join('');
    }
    return l;
  });
  // Only add a single natural opener near the middle if the script feels stiff
  const hasOpener = result.some(l => SPOKEN_FILLER.some(f => l.includes(f)));
  if (!hasOpener && result.length >= 4) {
    const midIdx = Math.floor(result.length / 2);
    const personaPhrases: Record<string, string> = {
      '小林': '我跟你说，',
      '小陈': '讲真，',
      '沐森兄': '你看，',
    };
    const phrase = personaPhrases[persona] || '说白了，';
    result[midIdx] = phrase + result[midIdx];
  }
  return result;
}

function enforceDurationLimit(lines: string[], duration: '15' | '30' | '60'): { lines: string[]; wordCount: number } {
  const limit = WORD_LIMITS[duration];
  const kept = [lines[0]];
  let wc = countChars(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const lwc = countChars(lines[i]);
    if (wc + lwc <= limit) { kept.push(lines[i]); wc += lwc; }
    else break;
  }
  if (duration === '15' && kept.length > 3) {
    return { lines: kept.slice(0, 3), wordCount: countChars(kept.slice(0, 3).join('')) };
  }
  return { lines: kept, wordCount: wc };
}

export function rewriteToSpokenScript(input: SpeakRewriteInput): SpeakRewriteResult {
  const changes: string[] = [];
  const enforcements: string[] = [];
  let script = input.script || '';
  const hook = input.hook || '';

  const bf = countChars(script);
  script = removeFiller(script);
  if (countChars(script) < bf) changes.push('删除空话填充词');

  script = removeEnumeration(script);
  if (script.includes('第一') || script.includes('第二')) changes.push('删除枚举结构');

  let lines = splitIntoSpokenLines(script);
  if (lines.some(l => l.length > 30)) changes.push('将长句拆分为短口语行');

  lines = applyPersonaTone(lines, input.accountPersona);
  changes.push('应用' + (input.accountPersona || '默认') + '语气');

  const r = enforceDurationLimit(lines, input.duration);
  if (r.lines.length < lines.length) {
    enforcements.push(input.duration + '秒: ' + lines.length + '行压缩到' + r.lines.length + '行');
  }

  const finalScript = (hook ? hook + '\n' : '') + r.lines.join('\n');

  return {
    script: finalScript, hook,
    wordCount: countChars(finalScript),
    lineCount: (hook ? r.lines.length + 1 : r.lines.length),
    lines: r.lines,
    changes: changes.slice(0, 5),
    enforcements: enforcements.slice(0, 3),
  };
}

export function checkLineLengths(script: string, maxLineChars = 30): { ok: boolean; violations: { line: number; text: string; length: number }[] } {
  const lines = script.split('\n').filter(l => l.trim());
  const violations = lines.map((l, i) => ({ line: i + 1, text: l, length: l.length })).filter(l => l.length > maxLineChars);
  return { ok: violations.length === 0, violations: violations.slice(0, 5) };
}

export function checkWordCount(script: string, duration: '15' | '30' | '60'): { ok: boolean; count: number; limit: number } {
  const count = countChars(script);
  return { ok: count <= WORD_LIMITS[duration], count, limit: WORD_LIMITS[duration] };
}
