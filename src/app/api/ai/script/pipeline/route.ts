// POST /api/ai/script/pipeline
// Canonical entry point — ALL script generation goes through runCanonicalPipeline().
// Providers NEVER bypass local rules, scoring, or risk checks.
// V5.1: Supports account_id server-side resolution + persona compiler

import { NextRequest, NextResponse } from 'next/server';
import { runCanonicalPipeline, CanonicalPipelineRequestSchema } from '@/lib/ai/script-pipeline';
import { createJob, processJob } from '@/lib/ai/jobs';
import { getCurrentProviderName } from '@/lib/ai/providers';
import { getAccountRepository } from '@/lib/accounts/mock-repository';
import { buildAccountPromptContext } from '@/lib/ai/persona-compiler';
import { validateAccountConfig } from '@/lib/accounts/schema';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode || 'sync';
    const provider = getCurrentProviderName();

    // DeepSeek defaults to async unless explicitly forced sync
    const effectiveMode = (mode === 'sync' && provider === 'deepseek' && body.forceSync !== true)
      ? 'async' : mode;

    // ===== Resolve account server-side =====
    // Priority: account_id (server) > legacy account (client)
    var resolvedAccount = null;
    var accountWarning = null;
    var accountPersonaContext = null;

    if (body.account_id) {
      var repo = getAccountRepository();
      resolvedAccount = await repo.getActiveById(body.account_id);
      if (!resolvedAccount) {
        return NextResponse.json({
          error: '账号 ' + body.account_id + ' 不存在或已停用',
          code: 'ACCOUNT_NOT_FOUND',
        }, { status: 404 });
      }
      // Check version
      if (body.account_version && body.account_version !== resolvedAccount.persona_version) {
        accountWarning = '客户端版本 ' + body.account_version + ' 与服务端 ' + resolvedAccount.persona_version + ' 不一致，使用服务端最新配置';
      }
      // Build persona context
      accountPersonaContext = buildAccountPromptContext(resolvedAccount, 'draft', {
        platform: resolvedAccount.default_platform,
      });
      // Replace legacy body.account with resolved server account
      body.account = resolvedAccount;
    } else if (body.account) {
      // Legacy mode: client sent full account — accept with warning
      accountWarning = '已废弃的客户端传 account 模式，请改用 account_id';
    }

    // Validate account config if resolved
    if (resolvedAccount) {
      var validation = validateAccountConfig(resolvedAccount);
      if (!validation.valid) {
        console.warn('[Account Config] Warning: ' + validation.errors.join(', '));
      }
    }

    // Parse input (validates schema)
    const parsed = CanonicalPipelineRequestSchema.parse(body);

    if (effectiveMode === 'async') {
      const job = createJob(parsed, 'script_generation', provider);
      
      processJob(job.id).catch(err => console.error('[Jobs] Background process error:', err));

      return NextResponse.json({
        ok: true, status: 'queued', jobId: job.id,
        pollingUrl: '/api/ai/script/jobs/' + job.id,
        accountWarning: accountWarning,
        personaVersion: resolvedAccount?.persona_version || null,
      }, { status: 202 });
    }

    // Sync mode: run directly
    const result = await runCanonicalPipeline(parsed);
    return NextResponse.json({
      ...result,
      aiUsed: !result.mock,
      endpoint: 'canonical',
      mode: 'sync',
      accountWarning: accountWarning,
      personaVersion: resolvedAccount?.persona_version || null,
      selectedAngle: result.selectedAngle || null,
      selectedHook: result.hookCandidates?.find((h: any) => h.id === parsed.selectedHookId)
        || (result.hookCandidates?.[0] || null),
    });
  } catch (err: any) {
    console.error('[Pipeline] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
