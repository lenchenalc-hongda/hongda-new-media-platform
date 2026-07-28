// POST /api/ai/script/pipeline
// Canonical entry point — ALL script generation goes through runCanonicalPipeline().
// Providers NEVER bypass local rules, scoring, or risk checks.
// V5.1: Supports account_id server-side resolution + persona compiler

import { NextRequest, NextResponse } from 'next/server';
import { runCanonicalPipeline, CanonicalPipelineRequestSchema } from '@/lib/ai/script-pipeline';
import { createJob, processJob } from '@/lib/ai/jobs';
import { getCurrentProviderName } from '@/lib/ai/providers';
import { resolveAccountGenerationContext, buildPersonaContextForTask } from '@/lib/ai/account-resolver';
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

    // ===== Unified account resolution =====
    var resolvedAccount = null;
    var accountWarning = null;
    var accountPersonaContext = null;

    try {
      var resolved = resolveAccountGenerationContext({
        account_id: body.account_id,
        account_version: body.account_version,
        legacy_account: body.account,
        platform: body.platform,
        product_or_process: body.productOrProcess,
        customer_pain: body.customerPain,
      });
      resolvedAccount = resolved.account;
      accountWarning = resolved.warning || null;
      if (resolved.version_mismatch) {
        console.warn('[Pipeline] Version mismatch: client=' + body.account_version + ' server=' + resolved.resolved_account_version);
      }
      accountPersonaContext = buildPersonaContextForTask(resolved, 'draft');
      // Replace legacy body.account with resolved server account
      body.account = resolved.account;
    } catch (e: any) {
      if (e.message.includes('不存在') || e.message.includes('停用') || e.message.includes('不可用')) {
        return NextResponse.json({ error: e.message, code: 'ACCOUNT_NOT_FOUND' }, { status: 404 });
      }
      // Legacy fallback
      if (body.account) {
        accountWarning = '账号解析失败，使用客户端传递的 legacy account: ' + e.message;
        resolvedAccount = body.account;
      } else {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }

    // Validate account config if resolved
    if (resolvedAccount) {
      var validation = validateAccountConfig ? validateAccountConfig(resolvedAccount) : {valid: true, errors: []};
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
    var personaHeaders: Record<string, string> = {};
    if (resolvedAccount && resolvedAccount.persona_version) {
      personaHeaders['X-Persona-Version'] = resolvedAccount.persona_version;
    } else if (accountWarning) {
      personaHeaders['X-Persona-Legacy-Fallback'] = 'true';
    }
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
    }, { headers: personaHeaders });
  } catch (err: any) {
    console.error('[Pipeline] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
