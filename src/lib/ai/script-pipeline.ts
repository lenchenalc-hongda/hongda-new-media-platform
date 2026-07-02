// Script Pipeline v2: Short-video script factory
// Generates real 短视频口播, not articles

export interface ScriptStrategy {
  topic: string;
  hook: string;
  corePoint: string;
  targetCustomer: string;
  customerPain: string;
  whyWatch: string;
  conversionGoal: string;
  suitablePlatform: string;
  suggestedDuration: string;
  risksToAvoid: string[];
}

export interface ShortVideoScript {
  title: string;
  hook: string;
  videoDuration: string;
  corePoint: string;
  suitableAccount: string;
  platform: string;
  script: string;
  shotSuggestion: string;
  subtitlePoints: string;
  commentGuidance: string;
  privateMessageCta: string;
  riskNotes: string;
  wordCount: number;
  estimatedDuration: string;
}

export interface RiskResult {
  riskLevel: '低' | '中' | '高';
  riskPoints: string[];
  allowSave: boolean;
  forbiddenExpressions: string[];
}

export interface ScoreResult {
  score: number;
  grade: string;
  strengths: string[];
  weaknesses: string[];
  rewriteSuggestions: string[];
  recommendedStatus: string;
}

// ===== Hook Generator =====
const HOOK_TEMPLATES: Record<string, string[]> = {
  price: [
    '客户只发一张瓶子图，问我多少钱，我一般不敢直接报。',
    '500个杯子，真的不能做热转印吗？',
    '图片看不到材质，我怎么给你报价？',
    '热转印一个多少钱？这话不能直接回答。',
  ],
  material: [
    'PE瓶能不能做热转印？你知道为什么不能直接回答吗？',
    '只说“塑料瓶”，我们为什么还要继续问材质？',
    'ABS、PP、PE，都叫塑料，但热转印效果能差一倍。',
    '不锈钢杯子做热转印，前提是什么？',
  ],
  test: [
    '你问我会不会掉，我最怕直接回答“不会”。',
    '耐酒精测试，不是一句“能不能”就能回答的。',
    '客户说要过洗碗机，这话得打样后才能回答。',
    '附着力测试不是“能不能过”，是“怎么测”。',
  ],
  color: [
    '客户说颜色按图片做，这个风险很大。',
    '手机上看到的颜色，不等于印出来的颜色。',
    '你说“就这个颜色”，我得先问你有没有潘通色号。',
    '金色、银色、幻彩色，不是普通印刷能做的。',
  ],
  sample: [
    '打样和大货做到一模一样，真的那么简单吗？',
    '客户说“不打样，直接做大货”，为什么有些订单不能接？',
    '免费打样，不是所有客户都能享受的。',
    '商样确认后换材料，为什么要重新打样？',
  ],
  small_batch: [
    '500个小批量，适不适合热转印？',
    '小批量多图案，数码热转印是不是最省钱的方案？',
    '10个也能做，但单价不会便宜，这话得说清楚。',
    '数码混打样可以，为什么不一定能当大货标准？',
  ],
  misunderstanding: [
    '客户只发图片，为什么判断不了能不能做热转印？',
    '“之前的厂家能做，你们为什么不能”，这话怎么回？',
    '客户说“按上次一样”，我们为什么还要找确认样？',
    '“别人家很便宜”，这话不能直接回。',
  ],
};

const HOOK_CATEGORIES = Object.keys(HOOK_TEMPLATES);

export function generateHook(category?: string, product?: string): string {
  const cat = category || HOOK_CATEGORIES[Math.floor(Math.random() * HOOK_CATEGORIES.length)];
  const hooks = HOOK_TEMPLATES[cat] || HOOK_TEMPLATES.price;
  let hook = hooks[Math.floor(Math.random() * hooks.length)];
  if (product) {
    hook = hook.replace(/热转印/g, product);
  }
  return hook;
}

// ===== Broad Topic Splitter =====
const TOPIC_SPLITS: Record<string, string[]> = {
  '客户常见问题': [
    '客户问多少钱，为什么不能直接报价？',
    '客户问能不能印，为什么要先问材质？',
    '客户问会不会掉，为什么要看测试要求？',
    '客户只发图片，为什么判断不了热转印？',
    '500个小批量，适不适合热转印？',
    '打样和大货，为什么不一定完全一样？',
    '客户说按图片颜色做，为什么风险很大？',
    '客户说不打样直接大货，为什么不能接？',
  ],
  '热转印介绍': [
    '热转印是什么？一句话说清楚。',
    '热转印适合什么材质？一句话说清楚。',
    '热转印一个多少钱？为什么不能直接报？',
    '数码热转印和传统热转印，有什么区别？',
    '热转印会不会掉？这话不能直接回答。',
  ],
  '数码热转印': [
    '数码混打样可以，为什么不一定能当大货标准？',
    '数码混不能做什么效果？',
    '数码混有起订量吗？',
    '数码混和凹印混，颜色为什么不能完全一样？',
  ],
  '工艺对比': [
    '热转印和丝印怎么选？',
    '热转印和水转印有什么区别？',
    'PP、PE、ABS，哪个热转印效果最好？',
    '数码混与凹印混，小批量选哪个？',
  ],
};

export function splitBroadTopic(topic: string): string[] {
  // Check direct match
  for (const [key, subs] of Object.entries(TOPIC_SPLITS)) {
    if (topic.includes(key)) {
      return subs;
    }
  }
  // Default splits
  return [
    '客户问多少钱，为什么不能直接报？',
    '客户问能不能印，要先问什么？',
    '客户只发图片，为什么判断不了？',
    '小批量多图案，最省钱的方案是什么？',
  ];
}

// ===== Duration-based Script Templates =====
// Each template is a 15s/30s/60s script that sounds like a real person talking

const SCRIPT_PATTERNS: Record<string, { '15': string[]; '30': string[]; '60': string[] }> = {
  price: {
    '15': [
      '客户只发一张图，问我多少钱。\n我不敢直接报。\n因为图片看不到材质，也看不到测试要求。\n你把材质、数量、图案发我，我先帮你判断工艺。',
    ],
    '30': [
      '客户只发一张瓶子图，问我多少钱。\n我一般不敢直接报。\n为什么？因为图片看不到材质。\nPP、PE、ABS都叫塑料，但价格能差一倍。数量也不知道，少量和大批量，单价也不一样。\n所以下次发图问价的时候，顺带把材质和数量说了。这样我才能给你一个参考价。',
    ],
    '60': [
      '客户只发一张瓶子图，问我多少钱。\n我一般不敢直接报。\n为什么？因为图片看不到三件事。\n第一，材质。PP、PE、ABS都叫塑料，但热转印效果能差一倍，价格也不一样。\n第二，数量。10个和10000个，方案完全不同。数量少走数码，量大走传统。\n第三，测试要求。要不要耐酒精？要不要过洗碗机？这些一开始不问，后面出问题全是我们抗。\n所以下次发图问价，把材质、数量、测试要求一起说了，我才能给准的参考价。',
    ],
  },
  material: {
    '15': [
      'PE瓶能不能做热转印？\n这话不能直接回答。\nPE材质表面能低，附着力确实不如ABS和PET。\n但不是不能做，是得先打样码。\n你把产品寄过来，我免费帮你测一下。',
    ],
    '30': [
      'PE瓶能不能做热转印？\n这话不能直接回答。\nPE材质表面能低，热转印附着力确实不如ABS。\n但不是不能做。我们有专门的PE胶水方向，但效果怎么样，得看你的产品表面、有没有处理过、测试标准是什么。\n所以最简单的办法，寄样。我免费帮你测，测完了再给答复。',
    ],
    '60': [
      'PE瓶能不能做热转印？\n这话我不敢直接回答。\n为什么？因为PE是一个很特殊的材质。表面能低，热转印附着力确实不如ABS和PET。\n但这不是说不能做。我们有专门的PE胶水方案，但能不能用，得看你的产品表面、有没有涂层、测试要求是什么。\n我见过很多客户，说是PE瓶，寄样过来一测，结果是PET材质，完全能做。\n所以最简单的办法，不是在网上问能不能做。是把产品寄给我们，免费打样，测完了再说。',
    ],
  },
};

function getPattern(type: string, duration: string): string[] {
  // Find matching type
  for (const [key, patterns] of Object.entries(SCRIPT_PATTERNS)) {
    if (type.includes(key) || key.includes(type)) {
      return patterns[duration as '15' | '30' | '60'] || patterns['15'];
    }
  }
  // Default to price
  return SCRIPT_PATTERNS.price[duration as '15' | '30' | '60'] || SCRIPT_PATTERNS.price['15'];
}

// ===== Duration-Based Compression =====
const WORD_LIMITS: Record<string, number> = {
  '15': 120,
  '30': 220,
  '60': 420,
};

export function compressScriptByDuration(script: string, duration: string): { compressed: string; wordCount: number } {
  const limit = WORD_LIMITS[duration] || 220;
  // Count Chinese characters (simple)
  const chineseChars = script.match(/[一-鿿]/g);
  const wordCount = chineseChars ? chineseChars.length : script.length;
  
  if (wordCount <= limit) {
    return { compressed: script, wordCount };
  }
  
  // Compress: remove lines that are too long, keep first and last
  const lines = script.split('\n').filter(l => l.trim());
  if (lines.length <= 3) {
    return { compressed: script.slice(0, limit * 2), wordCount: limit };
  }

  // 15-second scripts: keep hook + key content + short CTA
  if (duration === '15' && lines.length > 3) {
    // Find the first substantive content line (skip hook, skip customer questions, skip reflections)
        const contentCandidates = lines.slice(1).filter(l => {
      const t = l.trim();
      return t.length > 10 &&
             !t.startsWith('客户问') &&
             !t.startsWith('所以下次') &&
             !t.startsWith('这个问题很常见') &&
             !t.includes('评论区') &&
             !t.includes('你的产品') &&
             !t.startsWith('很多客户');
    });
    // Pick the most content-rich line (longest) for maximum value
    const contentLine = contentCandidates.sort((a: string, b: string) => b.length - a.length)[0] || '';
    // CTA: keep the last meaningful line (usually comment)
    const ctaLine = lines.slice(-1)[0];
    const compressed15 = [lines[0], contentLine, ctaLine].filter(Boolean).join('\n');
    const wc15 = compressed15.match(/[一-鿿]/g)?.length || 0;
    if (wc15 <= limit) {
      return { compressed: compressed15, wordCount: wc15 };
    }
    // If still over limit, shorten CTA
    const shortCta = ctaLine.slice(0, 15);
    const adjusted = [lines[0], contentLine.slice(0, 40), shortCta].filter(Boolean).join('\n');
    return { compressed: adjusted, wordCount: adjusted.match(/[一-鿿]/g)?.length || limit };
  }

  // 30-second and 60-second: keep first 2 lines + last line, remove middle
  const compressed30 = [lines[0], lines[1], lines[lines.length - 1]].join('\n');
  const newWordCount = compressed30.match(/[一-鿿]/g)?.length || 0;

  if (newWordCount > limit) {
    // Truncate last line
    const lastLine = lines[lines.length - 1];
    const trimmedLast = lastLine.slice(0, Math.max(30, lastLine.length - (newWordCount - limit) * 2));
    return {
      compressed: [lines[0], lines[1], trimmedLast].join('\n'),
      wordCount: limit,
    };
  }

  return { compressed: compressed30, wordCount: newWordCount };
}

// ===== Generate Short Video Script =====
export function generateShortVideoScript(input: any): ShortVideoScript {
  const duration = input.video_length || '30';
  const product = input.product_or_process || '';
  const pain = input.customer_pain || '';
  const account = input.account || {};
  const accountName = account.name?.split('-')[0] || '';
  
  // Use knowledge cards if provided
  const knowledgeCards: any[] = input.knowledgeCards || [];
  const firstCard = knowledgeCards[0];
  
  // Determine what this script is actually about
  let topic = '';
  let hook = '';
  let coreMsg = '';
  let subtitleText = '';
  let commentText = '';
  let pmText = '';
  let riskText = '';
  
  if (firstCard) {
    // Script based on knowledge card content
    topic = firstCard.title || '';
    coreMsg = firstCard.core_conclusion || firstCard.summary || '';
    hook = topic + '？' + '一次说清楚';
    subtitleText = firstCard.core_conclusion?.slice(0, 40) || '';
    commentText = '你的产品有没有遇到类似问题？评论区聊聊';
    pmText = '发产品资料给我们，免费帮你评估';
    riskText = firstCard.risky_expressions || firstCard.forbidden_expressions || '1. 以实际打样为准';
    
    // Generate script based on card content
    const lines: string[] = [];
    lines.push(hook);
    lines.push('');
    
    if (pain) {
      lines.push('客户问：' + pain + '。');
      lines.push('这个问题很常见，但回答之前要先搞清楚几件事。');
      lines.push('');
    }
    
    lines.push(coreMsg);
    lines.push('');
    
    if (firstCard.new_media_expression) {
      lines.push(firstCard.new_media_expression);
      lines.push('');
    }
    
    lines.push('所以下次遇到这个问题，你就知道怎么判断了。');
    lines.push(commentText);
    
    let script = lines.join('\n');
    const { compressed, wordCount } = compressScriptByDuration(script, duration);
    script = compressed;
    
    return {
      title: topic,
      hook: hook,
      videoDuration: duration + '秒',
      corePoint: coreMsg.slice(0, 50),
      suitableAccount: accountName,
      platform: input.platform || '视频号',
      script: script,
      shotSuggestion: accountName + '出镜讲解 + ' + firstCard.category + '相关画面',
      subtitlePoints: subtitleText,
      commentGuidance: commentText,
      privateMessageCta: pmText,
      riskNotes: riskText,
      wordCount,
      estimatedDuration: duration + '秒',
    };
  }
  
  // Fallback: no knowledge card selected - use account info
  const targetAudience = account.target_audience || '有热转印需求的客户';
  const conversionGoal = account.conversion_goal || '引导客户发产品图片和数量';
  
  hook = (pain || targetAudience) + '？我来帮你分析';
  coreMsg = product ? product + '的判断逻辑其实不复杂' : (account.persona || '热转印工艺判断');
  
  const fallbackLines: string[] = [];
  fallbackLines.push(hook);
  fallbackLines.push('');
  if (pain) {
    fallbackLines.push('很多客户都遇到过' + pain + '的情况。');
    fallbackLines.push('');
  }
  fallbackLines.push(coreMsg + '。关键看三点：材质、数量、测试要求。');
  fallbackLines.push('');
  fallbackLines.push('把这三样发给我，我帮你判断最合适的方案。');
  
  let script = fallbackLines.join('\n');
  const { compressed, wordCount } = compressScriptByDuration(script, duration);
  
  return {
    title: hook.slice(0, 25) + '...',
    hook: hook,
    videoDuration: duration + '秒',
    corePoint: coreMsg,
    suitableAccount: accountName,
    platform: input.platform || '视频号',
    script: compressed,
    shotSuggestion: accountName + '出镜讲解',
    subtitlePoints: '材质、数量、测试要求',
    commentGuidance: '你的产品是什么？评论区告诉我',
    privateMessageCta: conversionGoal,
    riskNotes: '不要承诺具体价格和交期',
    wordCount,
    estimatedDuration: duration + '秒',
  };
}

// ===== Batch Generate =====
const BATCH_ANGLES = ['价格', '材质', '测试', '颜色', '打样', '小批量', '客户误区', '工厂判断'];

export function batchGenerateShortScripts(input: any): { scripts: ShortVideoScript[]; scores: ScoreResult[]; risks: RiskResult[] }[] {
  const results: { scripts: ShortVideoScript[]; scores: ScoreResult[]; risks: RiskResult[] }[] = [];
  
  const count = input.count || 5;
  
  for (let i = 0; i < Math.min(count, BATCH_ANGLES.length); i++) {
    const scriptInput = {
      ...input,
      customer_pain: BATCH_ANGLES[i] + '相关问题',
      structure: SCRIPT_PATTERNS[BATCH_ANGLES[i] === '价格' ? 'price' : BATCH_ANGLES[i] === '材质' ? 'material' : 'price'] ? BATCH_ANGLES[i] : 'price',
    };
    
    const script = generateShortVideoScript(scriptInput);
    const risk = checkScriptRisk(script.script, []);
    const score = scoreVideoScript(script, input.account);
    
    results.push({ scripts: [script], scores: [score], risks: [risk] });
  }
  
  return results;
}

// ===== Remove AI Tone =====
const FORBIDDEN_PHRASES = [
  '很多客户问我这个问题',
  '今天统一回答一下',
  '今天给大家讲一下',
  '最近很多朋友问',
  '大家都知道',
  '在热转印行业中',
  '随着市场发展',
  '首先', '其次', '最后',
  '综上所述',
  '显而易见',
  '有效提升',
  '赋能',
  '助力',
  '专业解决方案',
  '欢迎联系我们',
];

export function removeAiTone(text: string): string {
  let result = text;
  FORBIDDEN_PHRASES.forEach(phrase => {
    const regex = new RegExp(phrase, 'g');
    result = result.replace(regex, '');
  });
  // Remove empty lines after removal
  result = result.replace(/\n\s*\n/g, '\n');
  return result.trim();
}

// ===== Risk Check =====
const RISK_PATTERNS = [
  { pattern: /[一定能做|肯定能做|保证能做]/, risk: '乱承诺能做' },
  { pattern: /[保证不掉|绝对不会掉|肯定不会掉]/, risk: '乱承诺附着力' },
  { pattern: /(\d+\.?\d*)元|(\d+\.?\d*)块钱/, risk: '报具体价格' },
  { pattern: /\d+天交货|一定交期/, risk: '承诺交期' },
  { pattern: /颜色一模一样|百分之百还原/, risk: '乱承诺颜色' },
  { pattern: /[最能|最好|第一|最专业|最便宜]/, risk: '绝对化表达' },
];

export function checkScriptRisk(script: string, knowledgeCards?: any[]): RiskResult {
  const riskPoints: string[] = [];
  const forbiddenExpressions: string[] = [];
  
  RISK_PATTERNS.forEach(({ pattern, risk }) => {
    const match = script.match(pattern);
    if (match) {
      riskPoints.push(risk);
      forbiddenExpressions.push(match[0]);
    }
  });
  
  // Check for forbidden phrases
  FORBIDDEN_PHRASES.forEach(phrase => {
    if (script.includes(phrase)) {
      riskPoints.push('出现禁止表达：' + phrase.slice(0, 10));
    }
  });
  
  const riskLevel: '低' | '中' | '高' = riskPoints.length === 0 ? '低' : riskPoints.length <= 2 ? '中' : '高';
  
  return {
    riskLevel,
    riskPoints: riskPoints.length > 0 ? [...new Set(riskPoints)] : ['未发现明显风险'],
    allowSave: riskLevel !== '高',
    forbiddenExpressions: [...new Set(forbiddenExpressions)],
  };
}

// ===== Video Script Scoring =====
const PENALTY_PATTERNS: { pattern: RegExp; penalty: number }[] = [
  { pattern: /很多客户问我这个问题/, penalty: -10 },
  { pattern: /今天统一回答一下/, penalty: -10 },
  { pattern: /今天给大家讲一下/, penalty: -10 },
  { pattern: /首先/, penalty: -5 },
  { pattern: /其次/, penalty: -5 },
  { pattern: /最后/, penalty: -5 },
  { pattern: /第一/, penalty: -5 },
  { pattern: /第二/, penalty: -5 },
  { pattern: /第三/, penalty: -5 },
];

export function scoreVideoScript(script: ShortVideoScript | string, account?: any): ScoreResult {
  const scriptText = typeof script === 'string' ? script : script.script;
  const wordCount = typeof script === 'string' ? (scriptText.match(/[一-鿿]/g) || []).length : script.wordCount;
  const duration = typeof script === 'string' ? '30' : script.videoDuration.replace('秒', '');
  
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];
  
  let score = 50; // Base score
  let deductions: string[] = [];
  
  // 1. Hook check (20 points)
  const firstLine = scriptText.split('\n')[0] || '';
  const hasHook = firstLine.includes('？') || firstLine.length < 20;
  if (hasHook) {
    score += 18;
    strengths.push('开头有具体钩子');
  } else {
    deductions.push('没有具体客户问题开头：-20');
    score -= 20;
  }
  
  // 2. Single point (15 points)
  const points = scriptText.match(/[第一|第二|第三|首先|其次|最后]/g);
  if (!points || points.length <= 2) {
    score += 14;
    strengths.push('只讲一个核心点');
  } else {
    deductions.push('一个脚本讲超过2个核心点：-15');
    score -= 15;
  }
  
  // 3. Oral degree (20 points)
  const oralKeywords = ['我跟你说', '说白了', '很简单', '我告诉你', '你记住', '因为', '所以'];
  const oralCount = oralKeywords.filter(k => scriptText.includes(k)).length;
  if (oralCount >= 3) {
    score += 18;
    strengths.push('语气像真人说话');
  } else if (oralCount >= 1) {
    score += 12;
    suggestions.push('语气可以更口语');
  } else {
    deductions.push('像文章不是口播：-20');
    score -= 20;
  }
  
  // 4. Customer pain clear (15 points)
  const hasPain = scriptText.includes('为什么') || scriptText.includes('怎么') || scriptText.includes('不能');
  if (hasPain) {
    score += 14;
    strengths.push('客户痛点明确');
  } else {
    score -= 10;
  }
  
  // 5. Factory judgment logic (10 points)
  const hasLogik = scriptText.includes('因为') || scriptText.includes('所以') || scriptText.includes('判断');
  if (hasLogik) {
    score += 9;
    strengths.push('有工厂判断逻辑');
  }
  
  // 6. Duration fit (10 points)
  const limit = WORD_LIMITS[duration] || 220;
  if (wordCount <= limit) {
    score += 9;
    strengths.push('适合' + duration + '秒时长');
  } else {
    deductions.push(duration + '秒脚本超过' + limit + '字：-15');
    score -= 15;
  }
  
  // 7. Natural CTA (5 points)
  const hasCta = scriptText.includes('评论') || scriptText.includes('发') || scriptText.includes('私信');
  if (hasCta) {
    score += 5;
    strengths.push('转化动作自然');
  } else {
    deductions.push('没有下一步动作：-10');
    score -= 10;
  }
  
  // 8. Safety (5 points)
  const hasRiskNotes = typeof script !== 'string' && script.riskNotes;
  if (hasRiskNotes || !scriptText.includes('保证') && !scriptText.includes('绝对')) {
    score += 5;
    strengths.push('风险表达安全');
  } else {
    deductions.push('没有风险提醒：-5');
    score -= 5;
  }
  
  // Apply penalties
  PENALTY_PATTERNS.forEach(({ pattern, penalty }) => {
    if (pattern.test(scriptText)) {
      score += penalty;
    }
  });
  
  // Clamp score
  const finalScore = Math.max(0, Math.min(100, score));
  
  let grade: string;
  if (finalScore >= 90) grade = 'A';
  else if (finalScore >= 80) grade = 'B';
  else if (finalScore >= 70) grade = 'C';
  else if (finalScore >= 60) grade = 'D';
  else grade = 'F';
  
  let recommendedStatus: string;
  if (finalScore >= 90) {
    recommendedStatus = 'pending_review';
    strengths.push('优秀脚本，建议提交审核');
  } else if (finalScore >= 80) {
    recommendedStatus = 'pending_review';
    strengths.push('可用脚本，建议审核');
  } else if (finalScore >= 70) {
    recommendedStatus = 'draft';
    suggestions.push('微调后可提交审核');
  } else if (finalScore >= 60) {
    recommendedStatus = 'draft';
    weaknesses.push('偏弱，建议重写');
  } else {
    recommendedStatus = '不建议保存';
    weaknesses.push('当前版本不建议使用');
  }
  
  return {
    score: finalScore,
    grade,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 3).concat(deductions.slice(0, 3)),
    rewriteSuggestions: suggestions.slice(0, 3),
    recommendedStatus,
  };
}

// ===== Pipeline =====
export function runPipeline(input: any): {
  scripts: ShortVideoScript[];
  risk: RiskResult;
  score: ScoreResult;
  isBroad: boolean;
  subTopics: string[];
} {
  // Check if topic is too broad
  const topic = input.customer_pain || input.topic || '';
  const isBroad = topic.length > 10 || ['介绍', '注意事项', '说清楚', '全部'].some(k => topic.includes(k));
  const subTopics = isBroad ? splitBroadTopic(topic) : [];
  
  // Generate script
  const script = generateShortVideoScript(input);
  const risk = checkScriptRisk(script.script, []);
  const score = scoreVideoScript(script, input.account);
  
  return { scripts: [script], risk, score, isBroad, subTopics };
}
