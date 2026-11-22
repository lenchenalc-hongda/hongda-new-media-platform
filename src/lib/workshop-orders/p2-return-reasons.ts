export type WosP2ReturnBlocker = {
  readonly id: string;
  readonly organization_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly blocker_code: string;
  readonly blocker_category: string;
  readonly status: string;
  readonly opened_at: string;
  readonly opened_by_profile_id: string | null;
  readonly description: string;
};

export type WosP2ReturnReason = {
  readonly reason: string;
  readonly code: 'P2_DOCUMENTS_INCOMPLETE';
  readonly openedAt: string;
  readonly operatorProfileId: string | null;
};

type P2ReturnReasonResult =
  | {
      readonly ok: true;
      readonly reasonsByOrder: ReadonlyMap<string, readonly WosP2ReturnReason[]>;
    }
  | {
      readonly ok: false;
      readonly code: 'RETURN_BLOCKER_SCOPE_MISMATCH' | 'RETURN_REASON_MISSING';
    };

export function buildWosP2ReturnReasons(input: {
  readonly organizationId: string;
  readonly orderIds: readonly string[];
  readonly blockers: readonly WosP2ReturnBlocker[];
}): P2ReturnReasonResult {
  const orderIds = new Set(input.orderIds);
  if (input.blockers.some(blocker =>
    blocker.organization_id !== input.organizationId
    || blocker.entity_type !== 'PRODUCTION_ORDER'
    || !orderIds.has(blocker.entity_id)
  )) {
    return {ok:false,code:'RETURN_BLOCKER_SCOPE_MISMATCH'};
  }

  const reasonsByOrder = new Map<string, WosP2ReturnReason[]>();
  for (const orderId of orderIds) reasonsByOrder.set(orderId, []);
  for (const blocker of input.blockers) {
    if (blocker.status !== 'OPEN'
        || blocker.blocker_code !== 'P2_DOCUMENTS_INCOMPLETE'
        || blocker.blocker_category !== 'DOCUMENT') continue;
    reasonsByOrder.get(blocker.entity_id)?.push({
      reason:blocker.description,
      code:'P2_DOCUMENTS_INCOMPLETE',
      openedAt:blocker.opened_at,
      operatorProfileId:blocker.opened_by_profile_id,
    });
  }

  if ([...reasonsByOrder.values()].some(reasons => reasons.length === 0)) {
    return {ok:false,code:'RETURN_REASON_MISSING'};
  }
  return {ok:true,reasonsByOrder};
}
