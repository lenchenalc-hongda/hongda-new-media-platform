import type {
  WosP2M2Action,
  WosV1StartRelease,
} from './p2-m2-contract';

export type WosV1M2Adapter = 'production' | 'qa-uat';

export interface WosV1M2HttpResult {
  readonly status: number;
  readonly ok: boolean;
  readonly code: string;
  readonly data: unknown;
}

export interface WosV1M2Capability {
  readonly adapter: WosV1M2Adapter;
  readonly writesEnabled: boolean;
}

export function parseWosV1M2Capability(
  value: unknown,
): WosV1M2Capability | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if ((row.m2Adapter !== 'production' && row.m2Adapter !== 'qa-uat')
    || typeof row.m2WriteEnabled !== 'boolean') return null;
  return {
    adapter: row.m2Adapter,
    writesEnabled: row.m2WriteEnabled,
  };
}

export async function fetchWosV1M2(
  action: WosP2M2Action | WosV1StartRelease,
  adapter: WosV1M2Adapter,
): Promise<WosV1M2HttpResult> {
  const path = adapter === 'qa-uat'
    ? '/api/workshop-orders/v1-qa/m2'
    : '/api/workshop-orders/v1/m2';
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-wos-v1-m2': '1',
    },
    body: JSON.stringify(action),
  });
  let value: unknown = null;
  try {
    value = await response.json();
  } catch {
    return {
      status: response.status,
      ok: false,
      code: 'INVALID_JSON_RESPONSE',
      data: null,
    };
  }
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  return {
    status: response.status,
    ok: response.ok && row?.ok === true,
    code: typeof row?.code === 'string' ? row.code : 'UNKNOWN_RESPONSE',
    data: row?.data ?? null,
  };
}
