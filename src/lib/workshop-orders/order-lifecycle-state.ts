export type WosWriteFailureDisposition =
  | 'REFRESH_REQUIRED'
  | 'RETRY_SAME_REQUEST'
  | 'FAILED';

export function classifyWosWriteFailure(
  status: number,
  code: string | null | undefined,
): WosWriteFailureDisposition {
  if (status === 409 || code === 'VERSION_OR_IDEMPOTENCY_CONFLICT') {
    return 'REFRESH_REQUIRED';
  }
  if (status >= 500
    || code === 'QA_P2_TRANSACTION_UNAVAILABLE'
    || code === 'QA_OFFICE_REVISION_RPC_NOT_AVAILABLE') {
    return 'RETRY_SAME_REQUEST';
  }
  return 'FAILED';
}

export function shouldApplyWosOfficeReturnedRead(input: {
  readonly requestGeneration: number;
  readonly currentGeneration: number;
  readonly aborted: boolean;
}): boolean {
  return !input.aborted && input.requestGeneration === input.currentGeneration;
}

export function wosResponsibleDisplay(input: {
  readonly responsibleName: string | null;
  readonly responsibleProfileId: string;
  readonly responsibleRole: string | null;
  readonly responsibleActive: boolean | null;
}): {
  readonly name: string;
  readonly role: string;
  readonly warning: string | null;
} {
  return {
    name: input.responsibleName?.trim() || input.responsibleProfileId,
    role: input.responsibleRole?.trim() || '档案受权限限制',
    warning: input.responsibleActive === false ? '责任人账号已停用，需要重新指派' : null,
  };
}
