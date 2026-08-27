// @server-only - identity resolution only; never a version authority.

import { callCaseAdminDetail, type CaseRpcClient } from './case-rpc';

export async function resolveAdminCaseId(
  client: CaseRpcClient,
  caseNo: string,
): Promise<string> {
  // The later mutation RPC re-locks and re-validates expectedVersion,
  // so this resolver is intentionally identity-only.
  const detail = await callCaseAdminDetail(client, caseNo);
  return detail.id;
}
