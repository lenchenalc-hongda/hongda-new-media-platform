import type {
  WosProductionOrder,
  WosSamplingRequest,
  WosVisualBaseline,
} from './domain';

export const WOS_FIXTURE_IDS = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  customerId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
  salesProfileId: '00000000-0000-4000-8000-000000000004',
  projectOwnerProfileId: '00000000-0000-4000-8000-000000000005',
  technicianProfileId: '00000000-0000-4000-8000-000000000006',
  productionOrderId: '00000000-0000-4000-8000-000000000010',
  samplingRequestId: '00000000-0000-4000-8000-000000000011',
  productionBaselineV1: '00000000-0000-4000-8000-000000000020',
  productionBaselineV2: '00000000-0000-4000-8000-000000000021',
  samplingBaselineV1: '00000000-0000-4000-8000-000000000022',
} as const;

export const productionOrderFixture: WosProductionOrder = {
  id: WOS_FIXTURE_IDS.productionOrderId,
  organizationId: WOS_FIXTURE_IDS.organizationId,
  customerId: WOS_FIXTURE_IDS.customerId,
  customerNameSnapshot: 'Fixture Customer',
  projectId: WOS_FIXTURE_IDS.projectId,
  projectNameSnapshot: 'Fixture Production Project',
  orderNumber: 'PO-FIXTURE-001',
  productName: 'PP cup',
  salesOwnerProfileId: WOS_FIXTURE_IDS.salesProfileId,
  projectOwnerProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
  priority: 'HIGH',
  isUrgent: false,
  versionLabel: 'V1',
  workflowStatus: 'READY_TO_START',
  requestedQuantity: 10000,
  currentBatchQuantity: 5000,
  plannedShipDate: '2026-11-15',
  productMaterial: 'PP',
  surfaceTreatment: null,
  customerAcceptanceStandard: 'Follow current approved sample.',
  createdByProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
};

export const samplingRequestFixture: WosSamplingRequest = {
  id: WOS_FIXTURE_IDS.samplingRequestId,
  organizationId: WOS_FIXTURE_IDS.organizationId,
  customerId: WOS_FIXTURE_IDS.customerId,
  customerNameSnapshot: 'Fixture Customer',
  projectId: WOS_FIXTURE_IDS.projectId,
  projectNameSnapshot: 'Fixture Sampling Project',
  productName: 'PP cup',
  productOwnerProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
  requestStage: 'ESTABLISHED',
  objectives: ['PRODUCIBILITY', 'ADHESION', 'POSITIONING'],
  versionLabel: 'V1',
  workflowStatus: 'READY_FOR_SAMPLING',
  resultDecision: null,
  productMaterial: 'PP',
  surfaceTreatment: null,
  sampleInputQuantity: 20,
  requiredGoodQuantity: 8,
  createdByProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
};

export const productionBaselineV1Fixture: WosVisualBaseline = {
  id: WOS_FIXTURE_IDS.productionBaselineV1,
  organizationId: WOS_FIXTURE_IDS.organizationId,
  entityType: 'PRODUCTION_ORDER',
  entityId: WOS_FIXTURE_IDS.productionOrderId,
  versionLabel: 'V1',
  status: 'CURRENT',
  confirmedByOfficeProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
  confirmedByWorkshopProfileId: WOS_FIXTURE_IDS.technicianProfileId,
};

export const productionBaselineV2DraftFixture: WosVisualBaseline = {
  id: WOS_FIXTURE_IDS.productionBaselineV2,
  organizationId: WOS_FIXTURE_IDS.organizationId,
  entityType: 'PRODUCTION_ORDER',
  entityId: WOS_FIXTURE_IDS.productionOrderId,
  versionLabel: 'V2',
  status: 'DRAFT',
  confirmedByOfficeProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
  confirmedByWorkshopProfileId: WOS_FIXTURE_IDS.technicianProfileId,
};

export const samplingBaselineV1Fixture: WosVisualBaseline = {
  id: WOS_FIXTURE_IDS.samplingBaselineV1,
  organizationId: WOS_FIXTURE_IDS.organizationId,
  entityType: 'SAMPLING_REQUEST',
  entityId: WOS_FIXTURE_IDS.samplingRequestId,
  versionLabel: 'V1',
  status: 'CURRENT',
  confirmedByOfficeProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
  confirmedByWorkshopProfileId: WOS_FIXTURE_IDS.technicianProfileId,
};
