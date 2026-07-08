import { z } from 'zod';

export const ScriptScoreInputSchema = z.object({
  script: z.string().min(1, '脚本内容不能为空'),
  duration: z.enum(['15', '30', '60']).default('30'),
  title: z.string().optional(),
});

export const ScriptScoreOutputSchema = z.object({
  totalScore: z.number().min(0).max(100),
  grade: z.enum(['S', 'A', 'B', 'C', 'D', 'F']),
  dimensions: z.array(z.object({
    name: z.string(), label: z.string(),
    maxScore: z.number(), score: z.number(), deduction: z.number(),
    reason: z.array(z.string()),
  })),
  penalties: z.array(z.object({
    reason: z.string(), deduction: z.number(),
  })),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  rewriteSuggestions: z.array(z.string()),
  recommendedStatus: z.enum(['pending_review', 'draft', 'needs_rewrite', 'discard']),
  riskLevel: z.enum(['低', '中', '高']),
  riskPoints: z.array(z.string()),
  saferExpressions: z.array(z.string()),
  wordCount: z.number(),
  duration: z.string(),
});

export type ScriptScoreInput = z.infer<typeof ScriptScoreInputSchema>;
export type ScriptScoreOutput = z.infer<typeof ScriptScoreOutputSchema>;

// ===== Pipeline Input Schemas =====

export const GenerateStrategyInputSchema = z.object({
  account: z.any().optional(),
  topic: z.string().optional(),
  customerPain: z.string().optional(),
  productOrProcess: z.string().optional(),
  material: z.string().optional(),
  knowledgeCards: z.array(z.any()).optional(),
});

export const GenerateStrategyOutputSchema = z.object({
  topic: z.string(),
  hook: z.string().max(30, '钩子不能超过30字'),
  hookType: z.enum(['conflict', 'question', 'counterintuitive', 'scenario', 'data']),
  targetCustomer: z.string(),
  customerPain: z.string(),
  corePoint: z.string(),
  whyWatch: z.string(),
  solveWhat: z.string(),
  structure: z.string(),
  conversionGoal: z.string(),
  risksToAvoid: z.array(z.string()),
  suitablePlatform: z.string(),
  suggestedDuration: z.string(),
  suggestedActing: z.string(),
});

export const DraftVariantSchema = z.object({
  duration: z.enum(['15', '30', '60']),
  hook: z.string().max(30, '钩子不能超过30字'),
  script: z.string(),
  wordCount: z.number().min(10).max(500),
  estimatedSeconds: z.number(),
  score: z.any().nullable(),
  subtitlePoints: z.array(z.string()),
});

export const PipelineResultSchema = z.object({
  strategy: GenerateStrategyOutputSchema,
  isBroad: z.boolean(),
  subTopics: z.array(z.string()),
  variants: z.array(DraftVariantSchema),
  bestVariant: DraftVariantSchema.nullable(),
  risk: z.object({
    riskLevel: z.enum(['低', '中', '高']),
    riskPoints: z.array(z.string()),
    allowSave: z.boolean(),
  }),
  recommendedStatus: z.enum(['pending_review', 'draft', 'needs_rewrite', 'discard']),
  mock: z.boolean(),
});

export const GenerateDraftInputSchema = z.object({
  strategy: z.any(),
  account: z.any().optional(),
  duration: z.enum(['15', '30', '60']).default('30'),
  template: z.string().optional(),
  knowledgeCards: z.array(z.any()).optional(),
});

export const GenerateDraftOutputSchema = z.object({
  title: z.string(),
  hook: z.string(),
  script: z.string(),
  shotSuggestion: z.string(),
  subtitlePoints: z.string(),
  commentGuidance: z.string(),
  privateMessageCta: z.string(),
  riskNotes: z.string(),
  wordCount: z.number(),
});

export const PolishScriptInputSchema = z.object({
  script: z.string().min(1),
});

export const PolishScriptOutputSchema = z.object({
  polishedScript: z.string(),
  changes: z.array(z.string()),
});

export const CheckRiskInputSchema = z.object({
  script: z.string().min(1),
  knowledgeCards: z.array(z.any()).optional(),
});

export const CheckRiskOutputSchema = z.object({
  riskLevel: z.enum(['低', '中', '高']),
  riskPoints: z.array(z.string()),
  allowSave: z.boolean(),
  forbiddenExpressions: z.array(z.string()),
});

// ===== Batch =====

export const BatchScriptResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  hook: z.string(),
  duration: z.string(),
  wordCount: z.number(),
  score: z.number().min(0).max(100),
  grade: z.string(),
  riskLevel: z.string(),
  recommendedStatus: z.string(),
  selected: z.boolean(),
});
