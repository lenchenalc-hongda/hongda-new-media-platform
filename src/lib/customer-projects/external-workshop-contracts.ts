// Phase 11 external workshop adapter contract.
// Repository evidence does not include an approved narrow workshop endpoint.
// These types define the boundary only; they do not supply or discover a URL.

export type ExternalWorkshopReadResult<T> =
  | {
      ok: true;
      data: T;
      observedAt: string;
    }
  | {
      ok: false;
      code: 'EXTERNAL_CONTRACT_PENDING' | 'NOT_FOUND' | 'UNAVAILABLE';
      message: string;
    };

export interface ExternalWorkshopCustomerReference {
  externalCustomerId: string;
  displayNameSnapshot: string;
  sourceAuthority: 'external_workshop_customer_master';
}

export interface ExternalWorkshopCustomerOwnershipReference {
  externalCustomerId: string;
  externalOwnerEmployeeId: string;
  ownerDisplayNameSnapshot: string | null;
  sourceAuthority: 'external_workshop_customer_ownership';
}

export interface ExternalWorkshopReceiptReference {
  externalReceiptId: string;
  externalCustomerId: string;
  sourceAuthority: 'external_workshop_receipt_records';
}

export interface ExternalWorkshopEmployeeProfileMapping {
  externalEmployeeId: string;
  profileId: string;
  orgId: string;
  verifiedAt: string;
}

export interface ExternalWorkshopReadAdapter {
  readonly contractStatus: 'external_contract_pending';
  readonly writeCapability: 'none';
  readCustomerByStableId(input: {
    externalCustomerId: string;
  }): Promise<ExternalWorkshopReadResult<ExternalWorkshopCustomerReference>>;
  readCustomerOwnershipByStableCustomerId(input: {
    externalCustomerId: string;
  }): Promise<ExternalWorkshopReadResult<ExternalWorkshopCustomerOwnershipReference>>;
  readReceiptByStableId(input: {
    externalReceiptId: string;
  }): Promise<ExternalWorkshopReadResult<ExternalWorkshopReceiptReference>>;
  resolveProfileByExternalEmployeeId(input: {
    externalEmployeeId: string;
    orgId: string;
  }): Promise<ExternalWorkshopReadResult<ExternalWorkshopEmployeeProfileMapping>>;
}

function pendingResult<T>(): ExternalWorkshopReadResult<T> {
  return {
    ok: false,
    code: 'EXTERNAL_CONTRACT_PENDING',
    message: 'No approved external workshop read contract is configured.',
  };
}

export function createExternalWorkshopReadAdapter(): ExternalWorkshopReadAdapter {
  return {
    contractStatus: 'external_contract_pending',
    writeCapability: 'none',
    async readCustomerByStableId() {
      return pendingResult<ExternalWorkshopCustomerReference>();
    },
    async readCustomerOwnershipByStableCustomerId() {
      return pendingResult<ExternalWorkshopCustomerOwnershipReference>();
    },
    async readReceiptByStableId() {
      return pendingResult<ExternalWorkshopReceiptReference>();
    },
    async resolveProfileByExternalEmployeeId() {
      return pendingResult<ExternalWorkshopEmployeeProfileMapping>();
    },
  };
}
