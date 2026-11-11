/**
 * Server-side WeCom application sender for a PRIVATE, explicitly authorized
 * test account only. No caller is wired up in P2-B: the cron, production flag,
 * SQL outbox integration and trusted fixed-egress proxy are NOT enabled.
 *
 * Never log request URLs (tokens and corpsecret are query parameters),
 * request payloads, or HTTP response bodies.
 */
import type { WecomTransportOutcome } from './wecom-outbox-state';

export type WecomFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type WecomSandboxConfig = {
  corpId: string;
  agentId: number;
  appSecret: string;
  environment: 'preview' | 'development' | 'production';
  sandboxEnabled: boolean;
  trustedEgressVerified: boolean;
  allowedTestWecomUserId: string;
};

const USER_ID = /^[A-Za-z0-9_.@-]{1,128}$/;
function safeUser(value: string): boolean {
  return USER_ID.test(value) && value.toLowerCase() !== '@all';
}

function redactedError(kind: WecomTransportOutcome['kind'], code: string): WecomTransportOutcome {
  if (kind === 'accepted') return { kind: 'accepted' };
  const safeCode = /^[A-Z0-9_\-]{1,40}$/i.test(code) ? code : 'UNCLASSIFIED';
  return { kind, code: safeCode };
}

export type WecomSandboxSendResult =
  | { status: 'blocked'; reason: 'NOT_AUTHORIZED' | 'INVALID_TARGET' | 'INVALID_CONFIG' }
  | { status: 'finished'; outcome: WecomTransportOutcome };

async function readProviderJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The caller MUST have a DB lease and current source/identity authorization.
 * This function additionally refuses real Production environments and any
 * user other than the one specifically approved for the sandbox.
 */
export async function sendWecomSandboxMessage(input: {
  config: WecomSandboxConfig;
  recipientWecomUserId: string;
  recipientVerified: boolean;
  sourceCurrent: boolean;
  text: string;
  fetcher: WecomFetch;
}): Promise<WecomSandboxSendResult> {
  const { config, recipientWecomUserId } = input;
  if (config.environment === 'production' || !config.sandboxEnabled
    || !config.trustedEgressVerified || !input.recipientVerified || !input.sourceCurrent) {
    return { status: 'blocked', reason: 'NOT_AUTHORIZED' };
  }
  if (!safeUser(recipientWecomUserId)
    || recipientWecomUserId !== config.allowedTestWecomUserId) {
    return { status: 'blocked', reason: 'INVALID_TARGET' };
  }
  if (!/^ww[A-Za-z0-9]{10,60}$/.test(config.corpId)
    || !Number.isSafeInteger(config.agentId) || config.agentId <= 0
    || config.appSecret.length < 12 || config.appSecret.length > 256
    || input.text.length === 0 || input.text.length > 1000) {
    return { status: 'blocked', reason: 'INVALID_CONFIG' };
  }

  // Authorization must be short lived; the full token is never returned to logs.
  // A pre-send failure is safe to retry because no message send has been attempted.
  let token: string;
  try {
    const qs = new URLSearchParams({ corpid: config.corpId, corpsecret: config.appSecret });
    const response = await input.fetcher(
      'https://qyapi.weixin.qq.com/cgi-bin/gettoken?' + qs.toString(),
      { method: 'GET', signal: AbortSignal.timeout(5000), cache: 'no-store' },
    );
    const value = await readProviderJson(response);
    if (!value || value.errcode !== 0 || typeof value.access_token !== 'string'
      || !value.access_token.trim()) {
      return { status: 'finished', outcome: redactedError('retryable_rejected', 'TOKEN_UNAVAILABLE') };
    }
    token = value.access_token;
  } catch {
    return { status: 'finished', outcome: redactedError('retryable_rejected', 'TOKEN_NETWORK') };
  }

  // No retries inside HTTP transport. If the network fails AFTER attempting
  // message/send, success is unknowable: mark UNKNOWN and investigate manually.
  try {
    const payload = {
      touser: recipientWecomUserId, msgtype: 'text', agentid: config.agentId,
      text: { content: input.text }, safe: 0, enable_id_trans: 0,
      enable_duplicate_check: 1, duplicate_check_interval: 600,
    };
    const response = await input.fetcher(
      'https://qyapi.weixin.qq.com/cgi-bin/message/send?'
      + new URLSearchParams({ access_token: token }).toString(),
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000), cache: 'no-store',
        body: JSON.stringify(payload),
      },
    );
    const value = await readProviderJson(response);
    if (!value || typeof value.errcode !== 'number') {
      return { status: 'finished', outcome: redactedError('unknown', 'SEND_UNCONFIRMED') };
    }
    const errcode = value.errcode;
    // errcode=0 is not sufficient: WeCom can accept a request while
    // returning recipients outside the app scope or lacking API licenses.
    // Never claim success when the requested single recipient was rejected.
    if (errcode === 0) {
      const rejected: Array<[string, string]> = [
        ['invaliduser', 'INVALID_USER'],
        ['unlicenseduser', 'UNLICENSED_USER'],
        ['invalidparty', 'INVALID_PARTY'],
        ['invalidtag', 'INVALID_TAG'],
      ];
      for (const [field, code] of rejected) {
        const valueField = value[field];
        if (valueField !== undefined && valueField !== null && typeof valueField !== 'string') {
          return { status: 'finished', outcome: redactedError('unknown', 'RESPONSE_MALFORMED') };
        }
        if (typeof valueField === 'string' && valueField.trim().length > 0) {
          return { status: 'finished', outcome: redactedError('permanent_rejected', code) };
        }
      }
      return { status: 'finished', outcome: { kind: 'accepted' } };
    }
    // Explicit provider rejection (not network error): safe to retry after backoff.
    if ([40014, 42001, 45009].includes(errcode)) {
      return { status: 'finished', outcome: redactedError('retryable_rejected', String(errcode)) };
    }
    return { status: 'finished', outcome: redactedError('permanent_rejected', String(errcode)) };
  } catch {
    return { status: 'finished', outcome: redactedError('unknown', 'SEND_NETWORK_UNKNOWN') };
  }
}
