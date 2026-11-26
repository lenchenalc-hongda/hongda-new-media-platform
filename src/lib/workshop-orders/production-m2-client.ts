import type {
  WosP2M2Action,
  WosV1StartRelease,
} from './p2-m2-contract';

export interface WosV1M2HttpResult {
  readonly status: number;
  readonly ok: boolean;
  readonly code: string;
  readonly data: unknown;
}

export async function fetchWosV1M2(
  action: WosP2M2Action | WosV1StartRelease,
): Promise<WosV1M2HttpResult> {
  const response = await fetch('/api/workshop-orders/v1/m2', {
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
