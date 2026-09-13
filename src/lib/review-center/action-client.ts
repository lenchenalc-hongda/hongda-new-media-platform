import type { ActionReadDto } from './actions';

export interface ActionCommandSuccessData {
  id: string;
  sequence: number;
  status: string;
  version: number;
  updatedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  cancelledAt: string | null;
}

export interface ActionOwnerCandidate {
  profileId: string;
  displayName: string;
  role: string;
  department: string | null;
  assignmentEligible: boolean;
}

export interface ActionCreateInput {
  title: string;
  description?: string | null;
  actionType: 'IMMEDIATE' | 'CORRECTIVE' | 'PREVENTIVE';
  ownerProfileId: string;
  dueDate: string;
}

export interface ActionUpdateInput extends ActionCreateInput {
  expectedVersion: number;
  description: string | null;
}

export class ActionClientError extends Error {
  status: number;
  code: string;
  safeData: unknown;

  constructor(status: number, code: string, message: string, safeData: unknown = null) {
    super(message);
    this.name = 'ActionClientError';
    this.status = status;
    this.code = code;
    this.safeData = safeData;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function requestJson(input: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ActionClientError(0, 'NETWORK_ERROR', '操作失败，请稍后重试', null);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const envelope = isObject(body) ? body : {};
    const code = typeof envelope.code === 'string' ? envelope.code : 'INTERNAL_ERROR';
    throw new ActionClientError(response.status, code, '操作失败，请稍后重试', null);
  }

  return body;
}

function parseSuccessEnvelope(body: unknown): Record<string, unknown> | null {
  if (!isObject(body)) return null;
  if (body.ok !== true || body.code !== 'OK') return null;
  return body;
}

function parseCommandSuccess(body: unknown): ActionCommandSuccessData {
  const envelope = parseSuccessEnvelope(body);
  const data = isObject(envelope?.data) ? envelope.data : null;
  const action = isObject(data?.action) ? data.action : null;
  if (!action) {
    throw new ActionClientError(500, 'INTERNAL_ERROR', '操作失败，请稍后重试', null);
  }
  if (
    typeof action.id !== 'string'
    || action.id.length === 0
    || typeof action.sequence !== 'number'
    || !Number.isInteger(action.sequence)
    || action.sequence < 1
    || typeof action.status !== 'string'
    || action.status.length === 0
    || typeof action.version !== 'number'
    || !Number.isInteger(action.version)
    || action.version < 1
    || typeof action.updatedAt !== 'string'
    || (action.completedAt !== null && typeof action.completedAt !== 'string')
    || (action.verifiedAt !== null && typeof action.verifiedAt !== 'string')
    || (action.cancelledAt !== null && typeof action.cancelledAt !== 'string')
  ) {
    throw new ActionClientError(500, 'INTERNAL_ERROR', '操作失败，请稍后重试', null);
  }
  return {
    id: action.id,
    sequence: action.sequence,
    status: action.status,
    version: action.version,
    updatedAt: action.updatedAt,
    completedAt: action.completedAt ?? null,
    verifiedAt: action.verifiedAt ?? null,
    cancelledAt: action.cancelledAt ?? null,
  };
}

export async function fetchActions(reviewId: string): Promise<ActionReadDto[]> {
  const body = await requestJson(
    `/api/review-center/reviews/${encodeURIComponent(reviewId)}/actions`,
  );
  const envelope = parseSuccessEnvelope(body);
  const data = isObject(envelope?.data) ? envelope.data : null;
  if (!Array.isArray(data?.actions)) {
    throw new ActionClientError(500, 'INTERNAL_ERROR', '操作失败，请稍后重试', null);
  }
  return data.actions as unknown as ActionReadDto[];
}

export async function createAction(
  reviewId: string,
  input: ActionCreateInput,
): Promise<ActionCommandSuccessData> {
  const body = await requestJson(
    `/api/review-center/reviews/${encodeURIComponent(reviewId)}/actions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        description: input.description ?? null,
        actionType: input.actionType,
        ownerProfileId: input.ownerProfileId,
        dueDate: input.dueDate,
      }),
    },
  );
  return parseCommandSuccess(body);
}

export async function updateAction(
  reviewId: string,
  actionId: string,
  input: ActionUpdateInput,
): Promise<ActionCommandSuccessData> {
  const body = await requestJson(
    `/api/review-center/reviews/${encodeURIComponent(reviewId)}/actions/${encodeURIComponent(actionId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: input.expectedVersion,
        title: input.title,
        description: input.description,
        actionType: input.actionType,
        ownerProfileId: input.ownerProfileId,
        dueDate: input.dueDate,
      }),
    },
  );
  return parseCommandSuccess(body);
}

export async function startAction(
  reviewId: string,
  actionId: string,
  expectedVersion: number,
): Promise<ActionCommandSuccessData> {
  const body = await requestJson(
    `/api/review-center/reviews/${encodeURIComponent(reviewId)}/actions/${encodeURIComponent(actionId)}/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion }),
    },
  );
  return parseCommandSuccess(body);
}

export async function submitActionForVerification(
  reviewId: string,
  actionId: string,
  expectedVersion: number,
  completionNote: string,
): Promise<ActionCommandSuccessData> {
  const body = await requestJson(
    `/api/review-center/reviews/${encodeURIComponent(reviewId)}/actions/${encodeURIComponent(actionId)}/submit-for-verification`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion, completionNote }),
    },
  );
  return parseCommandSuccess(body);
}

export async function verifyAction(
  reviewId: string,
  actionId: string,
  expectedVersion: number,
  verificationNote: string | null,
): Promise<ActionCommandSuccessData> {
  const body = await requestJson(
    `/api/review-center/reviews/${encodeURIComponent(reviewId)}/actions/${encodeURIComponent(actionId)}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion, verificationNote }),
    },
  );
  return parseCommandSuccess(body);
}

export async function returnAction(
  reviewId: string,
  actionId: string,
  expectedVersion: number,
  reason: string,
): Promise<ActionCommandSuccessData> {
  const body = await requestJson(
    `/api/review-center/reviews/${encodeURIComponent(reviewId)}/actions/${encodeURIComponent(actionId)}/return`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion, reason }),
    },
  );
  return parseCommandSuccess(body);
}

export async function cancelAction(
  reviewId: string,
  actionId: string,
  expectedVersion: number,
  reason: string,
): Promise<ActionCommandSuccessData> {
  const body = await requestJson(
    `/api/review-center/reviews/${encodeURIComponent(reviewId)}/actions/${encodeURIComponent(actionId)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion, reason }),
    },
  );
  return parseCommandSuccess(body);
}

export async function fetchActionOwnerDirectory(): Promise<ActionOwnerCandidate[]> {
  const body = await requestJson('/api/review-center/profile-directory?purpose=ACTION_OWNER');
  const envelope = parseSuccessEnvelope(body);
  const data = isObject(envelope?.data) ? envelope.data : null;
  if (!Array.isArray(data?.items)) {
    throw new ActionClientError(500, 'INTERNAL_ERROR', '操作失败，请稍后重试', null);
  }
  const candidates: ActionOwnerCandidate[] = [];
  for (const item of data.items) {
    if (!isObject(item)) {
      throw new ActionClientError(500, 'INTERNAL_ERROR', '操作失败，请稍后重试', null);
    }
    if (
      typeof item.profile_id !== 'string'
      || item.profile_id.length === 0
      || typeof item.display_name !== 'string'
      || typeof item.assignment_eligible !== 'boolean'
    ) {
      throw new ActionClientError(500, 'INTERNAL_ERROR', '操作失败，请稍后重试', null);
    }
    candidates.push({
      profileId: item.profile_id,
      displayName: item.display_name,
      role: typeof item.role === 'string' ? item.role : '',
      department: typeof item.department === 'string' ? item.department : null,
      assignmentEligible: item.assignment_eligible,
    });
  }
  return candidates;
}
