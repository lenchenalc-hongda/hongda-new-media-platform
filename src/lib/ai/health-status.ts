export type AiHealthStatus = 'loading' | 'connected' | 'mock' | 'offline';

type HealthResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

/** A configured provider is not the same as a tested live connection. */
export function classifyAiHealth(payload: unknown): AiHealthStatus {
  if (!payload || typeof payload !== 'object') return 'offline';
  const record = payload as Record<string, unknown>;
  if (record.mockMode === true) return 'mock';
  if (
    record.mockMode === false &&
    typeof record.aiProvider === 'string' &&
    record.aiProvider !== 'mock' &&
    record.aiProvider.trim().length > 0
  ) {
    return 'connected';
  }
  return 'offline';
}

export async function checkAiHealth(fetchHealth: () => Promise<HealthResponse>): Promise<AiHealthStatus> {
  try {
    const response = await fetchHealth();
    if (!response.ok) return 'offline';
    return classifyAiHealth(await response.json());
  } catch {
    return 'offline';
  }
}
