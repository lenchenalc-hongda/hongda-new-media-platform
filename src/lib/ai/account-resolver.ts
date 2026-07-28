// ===== Unified Account Resolver =====
// Every API route must go through this to resolve account + build persona context.
// Clients only send account_id; server resolves and validates.

import { getAccountRepository } from '@/lib/accounts/mock-repository';
import { buildAccountPromptContext } from './persona-compiler';
import { detectRelationshipDisclosure, buildDisclosureAugmentedBrandContract } from './relationship-disclosure';
import { isPersonaV2Enabled } from './feature-flags';
import type { AccountV2, CompiledPersonaContext, PersonaTask, Platform, FunnelStage } from '@/lib/accounts/types';
import type { RelationshipDisclosureContext } from './relationship-disclosure';
//import type { Record<string, any> } from './types';

export interface ResolveAccountInput {
  account_id?: string;
  account_version?: string;
  legacy_account?: unknown;

  platform?: string;
  audience_segment_id?: string;
  content_pillar_id?: string;
  funnel_stage?: string;

  // For relationship disclosure detection
  user_text?: string;
  topic?: string;
  product_or_process?: string;
  customer_pain?: string;
}

export interface ResolvedAccountContext {
  account: AccountV2;
  resolved_account_version: string;

  default_platform: Platform;
  audience_segment_id?: string;
  content_pillar_id?: string;
  funnel_stage: FunnelStage;

  disclosure_context: RelationshipDisclosureContext;

  source: 'repository' | 'legacy';
  version_mismatch: boolean;
  warning?: string;
}

export interface BuildPersonaContextInput {
  account: AccountV2;
  task: PersonaTask;
  options?: {
    platform?: string;
    audienceSegmentId?: string;
    contentPillarId?: string;
    funnelStage?: string;
  };
  disclosure_context?: RelationshipDisclosureContext;
}

export function resolveAccountGenerationContext(input: ResolveAccountInput): ResolvedAccountContext {
  var v2Enabled = isPersonaV2Enabled();
  var repo = getAccountRepository();
  var account: AccountV2 | null = null;
  var source: 'repository' | 'legacy' = 'repository';
  var version_mismatch = false;
  var warning: string | undefined;

  if (input.account_id && v2Enabled) {
    account = repo.getActiveByIdSync(input.account_id);
    if (!account) {
      throw new Error('账号 ' + input.account_id + ' 不存在或已停用');
    }
    if (account.status !== 'active') {
      throw new Error('账号 ' + input.account_id + ' 当前状态为 ' + account.status + '，不可用');
    }
    if (input.account_version && input.account_version !== account.persona_version) {
      version_mismatch = true;
      warning = '客户端版本 ' + input.account_version + ' 与服务端 ' + account.persona_version + ' 不一致，使用服务端最新配置';
    }
  } else if (input.legacy_account && !v2Enabled) {
    // Legacy fallback only when V2 is disabled
    account = input.legacy_account as AccountV2;
    source = 'legacy';
    warning = 'V2 已关闭，使用 legacy account 模式';
  } else if (input.account_id && !v2Enabled) {
    // V2 disabled, still try to resolve but use legacy
    account = repo.getActiveByIdSync(input.account_id);
    source = 'legacy';
    warning = 'V2 已关闭，使用 legacy 账号解析';
  } else {
    throw new Error('未提供 account_id 且 V2 未启用');
  }

  if (!account) {
    throw new Error('无法解析账号');
  }

  // Detect relationship disclosure
  var disclosureContext = detectRelationshipDisclosure({
    customerPain: input.customer_pain,
    topic: input.topic,
    productOrProcess: input.product_or_process,
    customerQuestion: input.user_text,
  });

  return {
    account: account,
    resolved_account_version: account.persona_version || (account as any).persona_version || '1.0.0',
    default_platform: (account as any).default_platform || account.platform || 'weixin',
    audience_segment_id: input.audience_segment_id,
    content_pillar_id: input.content_pillar_id,
    funnel_stage: (input.funnel_stage as FunnelStage) || 'awareness',
    disclosure_context: disclosureContext,
    source: source,
    version_mismatch: version_mismatch,
    warning: warning,
  };
}

export function buildPersonaContextForTask(
  resolved: ResolvedAccountContext,
  task: PersonaTask,
): CompiledPersonaContext {
  var ctx = buildAccountPromptContext(resolved.account, task, {
    platform: resolved.default_platform,
    audienceSegmentId: resolved.audience_segment_id,
    contentPillarId: resolved.content_pillar_id,
    funnelStage: resolved.funnel_stage,
  });

  // If disclosure is required, augment the brand contract
  if (resolved.disclosure_context.disclosure_required) {
    var augmentedBrand = buildDisclosureAugmentedBrandContract(
      resolved.account.brand_policy,
      resolved.disclosure_context,
    );
    ctx = {
      ...ctx,
      brand_contract: augmentedBrand,
      prompt_text: [
        ctx.identity_contract,
        ctx.audience_contract,
        ctx.content_contract,
        ctx.style_contract,
        augmentedBrand,
        ctx.conversion_contract,
        ctx.knowledge_contract,
        ctx.task_instructions,
      ].join('\n\n'),
    };
  }

  return ctx;
}

export function buildRouteAuditLog(resolved: ResolvedAccountContext, task: PersonaTask): Partial<Record<string, any>> {
  return {
    accountId: resolved.account.id,
    personaVersion: resolved.resolved_account_version,
    task: task,
    source: resolved.source,
    versionMismatch: resolved.version_mismatch,
    disclosureRequired: resolved.disclosure_context.disclosure_required,
  };
}

/** Build response headers for persona tracking */
export function buildPersonaResponseHeaders(resolved: ResolvedAccountContext): Record<string, string> {
  var headers: Record<string, string> = {};
  if (resolved.source === 'legacy') {
    headers['X-Persona-Legacy-Fallback'] = 'true';
  } else {
    headers['X-Persona-Version'] = resolved.resolved_account_version;
  }
  return headers;
}
