// ===== AI Run Logger =====
// Logs every AI pipeline execution for diagnostics and audit.
// In MVP, logs to console. When Supabase is connected, writes to ai_runs table.

export type AiRunType =
  | 'account_diagnosis' | 'generate_topics' | 'generate_script'
  | 'rewrite_script' | 'viral_teardown' | 'post_review'
  | 'lead_score' | 'lead_reply' | 'weekly_report' | 'score_script';

export interface AiRunLog {
  id: string;
  run_type: AiRunType;
  input_summary: string;
  output_summary: string;
  success: boolean;
  error_message?: string;
  duration_ms: number;
  mock_mode: boolean;
  model?: string;
  created_at: string;
}

let runCounter = 0;

// In-memory run log for the current session
const recentRuns: AiRunLog[] = [];

export function logAiRun(params: {
  run_type: AiRunType;
  input: any;
  output: any;
  success: boolean;
  error?: string;
  duration_ms: number;
}): AiRunLog {
  runCounter++;

  const isMock = !process.env.OPENAI_API_KEY;

  // Create a short summary of input/output for debugging
  const inputSummary = summarizeForLog(params.input, 100);
  const outputSummary = summarizeForLog(params.output, 100);

  const log: AiRunLog = {
    id: `ai_run_${Date.now()}_${runCounter}`,
    run_type: params.run_type,
    input_summary: inputSummary,
    output_summary: outputSummary,
    success: params.success,
    error_message: params.error,
    duration_ms: params.duration_ms,
    mock_mode: isMock,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    created_at: new Date().toISOString(),
  };

  // Store in memory (last 100 runs)
  recentRuns.unshift(log);
  if (recentRuns.length > 100) recentRuns.pop();

  // Console log for debugging
  const status = params.success ? '✅' : '❌';
  const mode = isMock ? '🧪' : '🤖';
  console.log(
    `[AI] ${mode} ${status} ${params.run_type} (${params.duration_ms}ms) ` +
    `→ ${outputSummary.slice(0, 60)}`
  );

  return log;
}

function summarizeForLog(obj: any, maxLen: number): string {
  if (!obj) return 'empty';
  if (typeof obj === 'string') return obj.slice(0, maxLen);
  try {
    const str = JSON.stringify(obj);
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
  } catch {
    return String(obj).slice(0, maxLen);
  }
}

// ===== Get recent runs for diagnostics =====
export function getRecentRuns(limit: number = 20): AiRunLog[] {
  return recentRuns.slice(0, limit);
}

// ===== Get run stats =====
export function getRunStats() {
  const total = recentRuns.length;
  const success = recentRuns.filter(r => r.success).length;
  const mock = recentRuns.filter(r => r.mock_mode).length;
  const real = recentRuns.filter(r => !r.mock_mode).length;
  const avgDuration = total > 0
    ? Math.round(recentRuns.reduce((sum, r) => sum + r.duration_ms, 0) / total)
    : 0;

  return { total, success, failed: total - success, mock, real, avgDuration };
}
