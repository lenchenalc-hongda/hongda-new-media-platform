// ===== Unified Script AI API Client =====
// All script generator API calls go through this file.
// Components never construct account payloads or manage error handling directly.

import type { Platform, FunnelStage, AccountV2 } from '@/lib/accounts/types';

/** Throw if account is not selected or inactive */
export function requireSelectedAccount(account: AccountV2 | undefined): AccountV2 {
  if (!account) {
    throw new Error('请先选择账号');
  }
  if (account.status !== 'active') {
    throw new Error('当前账号 ' + account.name + ' 已停用，不可用');
  }
  return account;
}

export interface AccountRequestContext {
  account_id: string;
  account_version: string;
  generation_platform?: Platform;
  audience_segment_id?: string;
  content_pillar_id?: string;
  funnel_stage?: FunnelStage;
}

export function buildAccountRequestContext(
  account: { id: string; persona_version?: string; default_platform?: Platform },
  form: {
    generation_platform?: string;
    audience_segment_id?: string;
    content_pillar_id?: string;
    funnel_stage?: string;
  },
): AccountRequestContext {
  return {
    account_id: account.id,
    account_version: (account as any).persona_version || '1.0.0',
    generation_platform: (form.generation_platform || account.default_platform || 'weixin') as Platform,
    audience_segment_id: form.audience_segment_id || undefined,
    content_pillar_id: form.content_pillar_id || undefined,
    funnel_stage: (form.funnel_stage || 'consideration') as FunnelStage,
  };
}

async function post<T>(url: string, body: Record<string, any>): Promise<T & { personaVersion?: string }> {
  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return { error: 'HTTP ' + res.status }; });
    throw new Error(err.error || '请求失败');
  }
  var data = await res.json();
  // Legacy tracking: if header present, log warning
  if (res.headers.get('X-Persona-Legacy-Fallback') === 'true') {
    console.warn('[AI Client] Legacy fallback used for', url);
  }
  return data;
}

// ===== API Methods =====

export async function suggestProducts(
  ctx: AccountRequestContext,
  input: { customerPain?: string; productOrProcess?: string; material?: string },
) {
  return post('/api/ai/script/suggest-products', {
    ...ctx,
    ...input,
  });
}

export async function suggestPains(
  ctx: AccountRequestContext,
  input: { customerPain?: string; productOrProcess?: string; material?: string },
) {
  return post('/api/ai/script/suggest-pains', {
    ...ctx,
    ...input,
  });
}

export async function recommendKnowledge(
  ctx: AccountRequestContext,
  input: { customerPain?: string; productOrProcess?: string; material?: string },
) {
  return post('/api/ai/script/recommend-knowledge', {
    ...ctx,
    ...input,
  });
}

export async function generateAngles(
  ctx: AccountRequestContext,
  input: { customerPain?: string; productOrProcess?: string; material?: string; platform?: string; knowledgeCards?: any[] },
) {
  return post('/api/ai/script/angles', {
    ...ctx,
    ...input,
  });
}

export async function generateHooks(
  ctx: AccountRequestContext,
  input: { customerPain?: string; productOrProcess?: string; material?: string; angle?: any; knowledgeCards?: any[]; recentScripts?: any[] },
) {
  return post('/api/ai/script/hooks', {
    ...ctx,
    ...input,
  });
}

export async function runPipeline(
  ctx: AccountRequestContext,
  input: {
    customerPain?: string;
    productOrProcess?: string;
    material?: string;
    topic?: string;
    durationSeconds?: string;
    knowledgeCards?: any[];
    selectedAngleId?: string;
    selectedHookId?: string;
    source_type?: string;
  },
) {
  return post('/api/ai/script/pipeline', {
    ...ctx,
    ...input,
  });
}

export async function rewriteScript(
  ctx: AccountRequestContext,
  input: { script: string; hook: string; feedback: string },
) {
  return post('/api/ai/script/duplicate-rewrite', {
    ...ctx,
    ...input,
  });
}
