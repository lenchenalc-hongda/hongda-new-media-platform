// @server-only - uses secret env vars, cannot be imported in 'use client' modules
import OpenAI from 'openai';
import {
  SYSTEM_PROMPT,
  ACCOUNT_DIAGNOSIS_PROMPT,
  GENERATE_TOPICS_PROMPT,
  GENERATE_SCRIPT_PROMPT,
  REWRITE_SCRIPT_PROMPT,
  VIRAL_TEARDOWN_PROMPT,
  POST_REVIEW_PROMPT,
  LEAD_SCORE_PROMPT,
  LEAD_REPLY_PROMPT,
  WEEKLY_REPORT_PROMPT,
} from './prompts';
import { logAiRun } from './logger';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';

export const AI_MOCK_MODE = !openaiApiKey;

function getClient() {
  if (!openaiApiKey) return null;
  return new OpenAI({ apiKey: openaiApiKey });
}

function parseJsonResponse(text: string): any {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return { error: 'Failed to parse AI response', raw: cleaned };
      }
    }
    return { error: 'Failed to parse AI response', raw: cleaned };
  }
}

function detectRunType(prompt: string): string {
  if (prompt.includes('account_diagnosis') || prompt.includes('诊断')) return 'account_diagnosis';
  if (prompt.includes('generate_topics') || prompt.includes('选题')) return 'generate_topics';
  if (prompt.includes('generate_script') || prompt.includes('脚本')) return 'generate_script';
  if (prompt.includes('rewrite') || prompt.includes('改写')) return 'rewrite_script';
  if (prompt.includes('viral_teardown') || prompt.includes('拆解')) return 'viral_teardown';
  if (prompt.includes('post_review') || prompt.includes('复盘')) return 'post_review';
  if (prompt.includes('lead_score') || prompt.includes('线索评分')) return 'lead_score';
  if (prompt.includes('lead_reply') || prompt.includes('回复')) return 'lead_reply';
  if (prompt.includes('weekly_report') || prompt.includes('周报')) return 'weekly_report';
  return 'weekly_report';
}

export async function callAI(prompt: string, systemPrompt: string = SYSTEM_PROMPT): Promise<any> {
  const startTime = Date.now();
  const runType = detectRunType(prompt) as any;
  const client = getClient();

  if (!client) {
    const result = getMockResponse(prompt);
    logAiRun({
      run_type: runType,
      input: { prompt: prompt.slice(0, 200) },
      output: result,
      success: true,
      duration_ms: Date.now() - startTime,
    });
    return result;
  }

  try {
    const response = await client.chat.completions.create({
      model: openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content || '{}';
    const result = parseJsonResponse(content);
    logAiRun({
      run_type: runType,
      input: { prompt: prompt.slice(0, 200) },
      output: result,
      success: true,
      duration_ms: Date.now() - startTime,
    });
    return result;
  } catch (error: any) {
    console.error('AI call failed:', error.message);
    const mockResult = getMockResponse(prompt);
    logAiRun({
      run_type: runType,
      input: { prompt: prompt.slice(0, 200) },
      output: mockResult,
      success: false,
      error: error.message,
      duration_ms: Date.now() - startTime,
    });
    return mockResult;
  }
}

function getMockResponse(prompt: string): any {
  if (prompt.includes('account_diagnosis') || prompt.includes('诊断')) {
    return {
      account_issues: ['内容缺乏差异化，与其他账号内容重叠', '互动引导不够明确', '选题不够聚焦目标客户痛点'],
      high_performance_commonality: '案例类和对比类内容完播率高，因为直接解决客户选择困难。结尾互动引导有效的视频线索产出更多。',
      low_performance_issues: '纯知识科普类内容完播率偏低，缺少视觉冲击力和钩子。工厂实拍类内容选题不够聚焦。',
      next_week_suggestions: ['做一期材质对比实测视频', '策划一个"翻车案例"增加真实感', '增加互动引导类的结尾设计'],
      risk_reminders: ['注意不要泄露客户信息', '不要过度承诺效果', '涉及测试标准需以实际报告为准'],
    };
  }
  if (prompt.includes('generate_topics') || prompt.includes('选题')) {
    return {
      topics: [
        { title: '热转印和丝印到底差在哪？一次讲清楚', suitable_account: '老板讲工艺号', content_type: 'process', target_audience: '纠结工艺选择的客户', customer_pain: '不知道选什么工艺', opening_hook: '很多人问热转印和丝印哪个好，今天直接告诉你答案', conversion_goal: '引导咨询', shooting_advice: '准备好两种工艺的样品做对比', risk_reminder: '不要偏颇地说一种工艺全面优于另一种' },
        { title: '印了20年的老师傅告诉你：这个材质不能热转印', suitable_account: '老板讲工艺号', content_type: 'qa', target_audience: '有产品需要判断的客户', customer_pain: '不确定材质是否适合', opening_hook: '有些材质看起来可以，但热转印就是不行', conversion_goal: '获取产品需求', shooting_advice: '展示多种材质的测试对比', risk_reminder: '以实际测试为准' },
        { title: '实拍：从开机到出成品的完整流程', suitable_account: '工厂实拍号', content_type: 'factory', target_audience: '关心工厂实力的客户', customer_pain: '不了解生产工艺', opening_hook: '从开机到出成品，今天把完整流程拍给你看', conversion_goal: '建立信任', shooting_advice: '跟拍一整天，剪辑加速', risk_reminder: '注意员工隐私' },
        { title: '客户要求7天交货，我们是怎么做到的？', suitable_account: '工厂实拍号', content_type: 'case', target_audience: '关注交期的客户', customer_pain: '担心交期太长', opening_hook: '急单怎么办？今天看看我们怎么抢时间', conversion_goal: '展示产能实力', shooting_advice: '展示快速换模、加班安排等', risk_reminder: '不要承诺客户同等交期' },
        { title: '从打样到量产：化妆品客户全流程', suitable_account: '案例展示号', content_type: 'case', target_audience: '化妆品行业客户', customer_pain: '不清楚打样到量产流程', opening_hook: '化妆品瓶盖热转印，从打样到交付只用了12天', conversion_goal: '获取样品需求', shooting_advice: '展示每一步的实物和文件', risk_reminder: '客户信息脱敏' },
        { title: '热转印最低起订量真的可以做100个吗？', suitable_account: '客户问答号', content_type: 'qa', target_audience: '小批量需求客户', customer_pain: '担心起订量太高', opening_hook: '100个能不能做？', conversion_goal: '引导私信', shooting_advice: '展示100个和1000个的包装区别', risk_reminder: '不能说具体价格' },
        { title: '为什么你的热转印总掉色？可能是这3个原因', suitable_account: '老板讲工艺号', content_type: 'process', target_audience: '有印刷质量困扰的客户', customer_pain: '转印效果不理想', opening_hook: '客户说热转印掉色，我一问发现是这个问题', conversion_goal: '树立专业形象', shooting_advice: '展示好的和差的对比', risk_reminder: '归因要客观' },
        { title: '车间实拍：这个产品的热转印难度在哪？', suitable_account: '工厂实拍号', content_type: 'product', target_audience: '有类似产品的客户', customer_pain: '不确定自己的产品能不能做', opening_hook: '这个产品看着简单，其实难度不小', conversion_goal: '建立信任', shooting_advice: '特写难度部位', risk_reminder: '不要过度强调难度吓退客户' },
        { title: '附着力测试现场：这个产品通过了吗？', suitable_account: '案例展示号', content_type: 'process', target_audience: '有测试要求的客户', customer_pain: '担心印刷品质', opening_hook: '附着力测试怎么做？今天现场测给你看', conversion_goal: '展示品控能力', shooting_advice: '完整记录测试过程', risk_reminder: '以实际测试报告为准' },
        { title: '热转印行业最大的坑是什么？做了20年的老板告诉你', suitable_account: '老板讲工艺号', content_type: 'industry', target_audience: '行业新进入者', customer_pain: '缺乏行业经验怕踩坑', opening_hook: '做热转印20年，我见过太多人踩这个坑', conversion_goal: '树立专家形象', shooting_advice: '老板出镜讲解', risk_reminder: '不要贬低同行' },
      ],
    };
  }
  if (prompt.includes('generate_script') || prompt.includes('脚本')) {
    return {
      title: '热转印和丝印到底差在哪？一次讲清楚',
      suitable_account: '老板讲工艺号',
      target_audience: '纠结工艺选择的客户',
      content_purpose: '帮助客户快速判断应该选热转印还是丝印',
      video_duration: 50,
      core_hook: '热转印和丝印不是哪个更好，而是你选错了',
      main_script: '很多人问我：热转印和丝印到底哪个好？\n\n其实这个问题问错了。不是哪个好，是你的产品适合哪个。\n\n听我讲清楚三点：\n\n第一，看数量。丝印制版费高，适合大货。热转印数码打印，小批量也能做。\n\n第二，看材质。丝印对材质要求低，但颜色单调。热转印色彩丰富，但对材质表面有要求。\n\n第三，看精度。热转印可以做到渐变色、照片效果。丝印色块均匀，但细节有限。\n\n你的产品是什么？有什么要求？评论区告诉我，我帮你判断。',
      shot_list: [
        { sequence: 1, duration: '0-8s', visual: '老板手持两种印刷样品面对镜头', audio: '开场钩子', text_overlay: '热转印 vs 丝印', props: '两种样品' },
        { sequence: 2, duration: '8-18s', visual: '展示两种印刷设备对比画面', audio: '第一点：数量', text_overlay: '看数量', props: null },
        { sequence: 3, duration: '18-28s', visual: '不同材质印刷效果展示', audio: '第二点：材质', text_overlay: '看材质', props: '多种材质样品' },
        { sequence: 4, duration: '28-38s', visual: '细节放大对比', audio: '第三点：精度', text_overlay: '看精度', props: '放大镜' },
        { sequence: 5, duration: '38-50s', visual: '回到镜头前总结', audio: '引导互动', text_overlay: '你的产品适合哪个？', props: null },
      ],
      shooting_props: '热转印样品3-5个、丝印样品3-5个、放大镜、不同材质产品',
      subtitle_points: '1. 热转印：小批量、色彩丰富、精度高\n2. 丝印：材质适应广、大货成本低\n3. 看你的产品数量和材质要求',
      cover_text: '热转印还是丝印？3点帮你判断',
      comment_reply: '你的产品印什么？什么材质？发图帮你判断',
      private_message_cta: '发产品图片和数量，免费给你评估最适合的印刷工艺和报价',
      risk_notes: '1. 不要承诺具体价格\n2. 以实际产品和材质评估为准\n3. 大货丝印和热转印成本差异需要具体核算',
    };
  }
  if (prompt.includes('rewrite') || prompt.includes('改写')) {
    return {
      rewritten_script: '很多人问我热转印和丝印怎么选？\n\n告诉你：不是哪个好，是你的产品适合哪个。\n\n记住三点：第一，看数量——丝印要制版，大货划算；热转印一张也行。第二，看材质——丝印什么都能印，颜色简单；热转印颜色漂亮，但材质要挑。第三，看精度——热转印能做渐变色，丝印做不了。\n\n你的产品什么情况？评论区说说，我帮你判断。',
      changes_made: ['缩短句子长度', '删除书面语，增加口语化表达', '增加停顿感，更适合口播'],
    };
  }
  if (prompt.includes('viral_teardown') || prompt.includes('拆解')) {
    return {
      why_viral: '这个视频抓住了客户最关心的"如何选工艺"的核心痛点。开头用否定句式制造冲突感，吸引停留。中间用具体对比增加信息价值，结尾引导互动增加评论量。',
      target_pain: '客户在面对多种印刷工艺时不知道如何选择，怕选错工艺导致成本增加或效果不好。',
      hook_analysis: '开头用"千万别选"这种否定句式制造认知冲突，吸引用户停下来看原因。',
      structure: '抛出问题 → 列出对比维度 → 逐点分析 → 给出判断标准 → 引导互动',
      trust_elements: '具有工厂实拍背景、有具体产品对比画面、有数据支撑',
      conversion_action: '评论区留言产品信息获取专业建议',
      learnable_points: ['开头制造认知冲突的句式效果明显', '三要素对比结构清晰易懂', '结尾的互动引导精准筛选目标客户'],
      not_suitable: ['如果没有真实产品对比素材，效果打折扣', '过于通用的话术缺乏工厂特色'],
      adapted_topics: [
        { title: '热转印还是水转印？3个维度帮你判断', suitable_account: '老板讲工艺号', approach: '用同样的三要素对比结构，结合宏达实际案例' },
        { title: '做小批量印刷，这2个工艺最省钱', suitable_account: '客户问答号', approach: '针对小批量需求做工艺对比，给出推荐方案' },
        { title: '客户案例：这个产品选了热转印，省了30%成本', suitable_account: '案例展示号', approach: '用真实案例讲工艺选择带来的实际效益' },
      ],
      suggested_script: '很多人问热转印和水转印怎么选？今天告诉你一个最简单的方法。',
    };
  }
  if (prompt.includes('post_review') || prompt.includes('复盘')) {
    return {
      performance_judgment: '数据表现中等偏上，完播率理想，但互动率有提升空间。',
      what_worked: '开头钩子设计有效，目标用户精准，内容信息密度高。',
      what_went_wrong: '结尾互动引导偏弱，缺少视觉冲击力的画面切换。',
      next_optimization: '加强结尾的行动号召，增加1-2个视觉亮点镜头。',
      worth_template: true,
      next_content_direction: '可以做一个同系列的进阶内容，深入讲其中某一个点。',
    };
  }
  if (prompt.includes('lead_score') || prompt.includes('线索评分')) {
    return {
      lead_score: 72,
      lead_grade: 'B',
      reasoning: '客户有明确的产品需求，信息较完善，但缺少产品图片和材质确认，需要进一步沟通确认可行性。',
      missing_info: ['产品图片', '产品材质确认', '是否有设计稿', '预算范围'],
      next_questions: ['方便发一下产品图片吗？', '产品的材质是？确认一下是否适合热转印', '有设计稿吗？还是需要我们设计？'],
      suggest_handover: false,
      risk_reminders: ['不要给客户报价', '先确认材质和工艺可行性再讨论价格', '注意保护客户隐私'],
    };
  }
  if (prompt.includes('lead_reply') || prompt.includes('回复')) {
    return {
      recommended_reply: '感谢您的咨询！为了给您更准确的建议，想先了解一下：您的产品是什么材质？大概数量是多少？方便的话可以发一下产品图片吗？',
      follow_up_questions: ['产品材质是什么？', '大概要印多少个？', '有设计稿吗？', '预算范围大概多少？'],
      cant_say: ['不要说具体价格', '不要承诺一定能做', '不要承诺交期'],
      need_sales_or_tech: false,
    };
  }
  if (prompt.includes('weekly_report') || prompt.includes('周报')) {
    return {
      weekly_summary: '本周共发布8条视频，总播放量3.2万，新增线索42条，有效线索12条。问答类内容播放量最高，案例类线索转化率最高。',
      account_performance: [
        { account_name: '老板讲工艺号', summary: '发布3条，播放量1.1万，线索15条，完播率62%表现优秀', score: 85 },
        { account_name: '工厂实拍号', summary: '发布2条，播放量0.8万，线索8条，完播率偏低需优化', score: 65 },
        { account_name: '案例展示号', summary: '发布1条，播放量0.6万，线索10条，线索转化率最高', score: 80 },
        { account_name: '客户问答号', summary: '发布2条，播放量1.3万，线索20条，播放量高但线索质量偏低', score: 70 },
      ],
      content_type_performance: [
        { type: 'process', views: 12000, leads: 14, assessment: '工艺类内容受众精准，适合持续产出' },
        { type: 'factory', views: 8000, leads: 8, assessment: '工厂实拍转粉率高，继续优化钩子' },
        { type: 'case', views: 6000, leads: 10, assessment: '案例类线索转化率最高，值得增加频次' },
        { type: 'qa', views: 13000, leads: 20, assessment: '问答类播放量高但线索质量偏低，需要调整引导方式' },
      ],
      lead_performance: '本周有效线索率28.6%，其中案例号和老板号的线索质量最高。问答号的线索量大但需要进一步筛选。',
      high_value_posts: ['热转印为什么比水转印更适合小批量？（线索8条，有效3条）', '从打样到量产：化妆品热转印案例（线索10条，有效6条）'],
      low_value_posts: ['一台热转印机一天能打多少？（线索4条，有效2条）'],
      next_week_suggestions: ['增加案例类内容的发布频次', '为问答号设计更精准的线索筛选话术', '工厂实拍号的钩子需要重新设计'],
    };
  }
  return { message: 'AI功能已返回模拟结果（未配置OpenAI API Key）' };
}
