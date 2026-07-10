// ===== LLM Provider Adapter =====
// DeepSeek is NOT the pipeline. It's a generator inside the pipeline.
// All AI output is validated by Zod, then passed through local rules.

import { z } from 'zod';
import { getProvider } from '../providers';


// ===== Zod Schemas for AI Output Validation =====

export const AngleSchema = z.object({
  angle: z.string().min(1, '角度不能为空').max(30),
  painPoint: z.string().min(1),
  coreQuestion: z.string().min(1),
  priority: z.number().min(1).max(10),
});

export const HookCandidateSchema = z.object({
  hook: z.string().min(1).max(30, '钩子不能超过30字'),
  type: z.enum(['question', 'conflict', 'scenario', 'data', 'counterintuitive']),
  targetPain: z.string(),
  strength: z.number().min(1).max(10),
});

export const AiDraftSchema = z.object({
  hook: z.string().min(1).max(30),
  body: z.string().min(1),
  wordCount: z.number().min(10).max(500),
  subtitlePoints: z.array(z.string()).optional(),
});

export const AiJudgementSchema = z.object({
  structureScore: z.number().min(0).max(25),
  spokenScore: z.number().min(0).max(25),
  painScore: z.number().min(0).max(25),
  ctascore: z.number().min(0).max(25),
  suggestions: z.array(z.string()).optional(),
});

// ===== LLMAdapter =====

export class LLMAdapter {
  private async callLLM(prompt: string, schema: z.ZodType<any>, maxRetries = 2): Promise<any> {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const provider = await getProvider();
        const response = await provider.generateStructured({
          systemPrompt: '你是一个短视频脚本专家。输出JSON格式，不要markdown包裹。',
          userPrompt: prompt,
          outputFormat: 'json',
          temperature: 0.8,
        });
        // Try schema validation
        if (response.parsed) {
          const parsed = schema.safeParse(response.parsed);
          if (parsed.success) return parsed.data;
          console.warn(`[LLM] Schema validation failed (attempt ${i+1}):`, 
            parsed.error.issues.map((e: any) => e.message).join('; '));
          // Still return raw content as fallback
          if (response.parsed.hook || response.parsed.body || response.parsed.angles || response.parsed.hooks) {
            console.log('[LLM] Using raw response despite schema failure');
            return response.parsed;
          }
        }
        // Try to extract JSON from response.content
        if (response.content) {
          try {
            const extracted = JSON.parse(response.content);
            const parsedAgain = schema.safeParse(extracted);
            if (parsedAgain.success) return parsedAgain.data;
          } catch {}
        }
      } catch (err: any) {
        console.warn(`[LLM] API call failed (attempt ${i+1}):`, err.message);
      }
    }
    return null; // Signal fallback to rule engine
  }

  /** 生成多角度候选 */
  async generateAngles(input: { topic: string; customerPain?: string; productOrProcess?: string; material?: string }): Promise<any[]> {
    const prompt = `请为以下主题生成3-5个短视频内容角度。

主题：${input.topic}
客户痛点：${input.customerPain || '无'}
产品/工艺：${input.productOrProcess || '无'}
材质：${input.material || '无'}

要求：
1. 每个角度一句话说清楚
2. 角度之间要有明显差异
3. 每个角度要围绕一个客户具体问题

输出JSON格式：
{
  "angles": [
    { "angle": "角度标题（不超过15字）", "painPoint": "客户的什么问题", "coreQuestion": "一句话核心问题", "priority": 1-10的数字，10最高 }
  ]
}`;

    const result = await this.callLLM(prompt, z.object({ angles: z.array(AngleSchema) }));
    return result?.angles || [];
  }

  /** 生成多钩子候选 */
  async generateHooks(input: { topic: string; angle: string; customerPain?: string }): Promise<any[]> {
    const prompt = `请为以下短视频内容生成3-5个开头钩子。

主题：${input.topic}
内容角度：${input.angle}
客户痛点：${input.customerPain || '无'}

要求：
1. 每个钩子不超过25字
2. 直接点出客户具体问题或冲突
3. 不要用"很多客户问我这个问题""今天统一回答一下"等废话

输出JSON格式：
{
  "hooks": [
    { "hook": "钩子文本", "type": "question/conflict/scenario/data/counterintuitive", "targetPain": "对应的客户痛点", "strength": 1-10的整数，10为最强 }
  ]
}`;

    const result = await this.callLLM(prompt, z.object({ hooks: z.array(HookCandidateSchema) }));
    return result?.hooks || [];
  }

  /** 生成脚本初稿（LLM只产出内容，不负责格式限制） */
  async generateDraft(input: { hook: string; angle: string; targetCustomer: string; customerPain: string; productOrProcess?: string }): Promise<any> {
    const prompt = `请根据以下信息生成一条短视频口播脚本。

钩子：${input.hook}
内容角度：${input.angle}
目标客户：${input.targetCustomer}
客户痛点：${input.customerPain}
产品/工艺：${input.productOrProcess || '无'}

要求：
1. 开头就钩子展开
2. 中间讲清楚一个核心判断逻辑
3. 语言像工厂老板/业务员在说话，不要像文章
4. 每句话不超过30字
5. 结尾自然引导下一步
6. 不要用"首先""其次""最后"

输出JSON格式：
{
  "hook": "开头钩子",
  "body": "完整口播稿，每行一句",
  "wordCount": "中文字数",
  "subtitlePoints": ["字幕重点1", "字幕重点2"]
}`;

    const result = await this.callLLM(prompt, AiDraftSchema);
    return result;
  }

  /** 按反馈重写脚本 */
  async rewriteScript(input: { script: string; feedback: string }): Promise<any> {
    const prompt = `请根据反馈意见重写以下脚本。

原脚本：
${input.script}

反馈意见：
${input.feedback}

要求：保持核心信息不变，只根据反馈改进表达方式。

输出JSON格式：{ "hook": "...", "body": "...", "wordCount": 数字 }`;

    const result = await this.callLLM(prompt, AiDraftSchema);
    return result;
  }

  /** AI评分（只作为参考，最终分数由本地评分决定） */
  async judgeScript(input: { script: string; duration: string }): Promise<any> {
    const prompt = `请对以下短视频脚本进行评分。

脚本内容：
${input.script}
目标时长：${input.duration}秒

评分维度（每项满分25）：
- structureScore：结构清晰度，有没有钩子→问题→解释→引导
- spokenScore：口语化程度，像不像真人在说话
- painScore：痛点清晰度，客户问题是否明确
- ctascore：转化引导质量，结尾有没有自然引导

输出JSON格式：
{
  "structureScore": 0-25的数字,
  "spokenScore": 0-25的数字,
  "painScore": 0-25的数字,
  "ctascore": 0-25的数字,
  "suggestions": ["改进建议1", "改进建议2"]
}`;

    const result = await this.callLLM(prompt, AiJudgementSchema);
    return result;
  }
}
