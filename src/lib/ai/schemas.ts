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
