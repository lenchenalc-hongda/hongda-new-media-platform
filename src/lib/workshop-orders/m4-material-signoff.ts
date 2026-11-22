import {
  WOS_QA_IMAGE_CATEGORIES,
  WOS_QA_IMAGE_CATEGORY_LABELS,
  buildWosQaImageObjectPath,
  isWosQaImageCategory,
  type WosQaImageCategory,
} from './qa-image-categories';
import {
  WOS_P2_MATERIALS,
  evaluateWosP2Readiness,
  type WosP2BlockerRow,
  type WosP2ReadinessResult,
  type WosP2ResourceRow,
} from './p2-qa-readiness';

/**
 * M4-01 read model for the ordinary Workshop Inbox.
 *
 * This module is deliberately read-only. Authenticated RLS does not currently
 * expose private image proofs or M2 receipts, so those facts remain explicitly
 * unverified instead of being inferred from image or baseline presence.
 */
export interface WosM4BaselineRecord {
  readonly id: string;
  readonly organization_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly version_label: string;
  readonly status: string;
  readonly confirmed_by_office_profile_id: string | null;
  readonly confirmed_by_workshop_profile_id: string | null;
  readonly office_confirmed_at: string | null;
  readonly workshop_confirmed_at: string | null;
  readonly created_at: string;
  readonly superseded_at: string | null;
  readonly office_proof_set_digest: string | null;
  readonly office_post_order_version: number | null;
  readonly workshop_proof_set_digest: string | null;
  readonly workshop_post_order_version: number | null;
}

export interface WosM4ResourceRecord extends WosP2ResourceRow {
  readonly organization_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
}

export interface WosM4BlockerRecord extends WosP2BlockerRow {
  readonly organization_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
}

export interface WosM4BaselineItemRecord {
  readonly baseline_id: string;
  readonly reference_image_id: string;
  readonly display_order: number;
  readonly is_required: boolean;
}

export interface WosM4ReferenceImageRecord {
  readonly id: string;
  readonly organization_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly category: string;
  readonly version_label: string;
  readonly image_status: string;
  readonly file_name: string;
  readonly uploaded_at: string;
  readonly superseded_at: string | null;
  readonly supersedes_image_id: string | null;
  readonly storage_bucket: string;
  readonly storage_path: string;
}

export interface WosM4ProfileRecord {
  readonly id: string;
  readonly org_id: string;
  readonly full_name: string | null;
  readonly role: string;
  readonly is_active: boolean;
}

export interface WosM4HistoryRecord {
  readonly previous_status: string | null;
  readonly next_status: string;
  readonly actor_profile_id: string | null;
  readonly actor_role: string;
  readonly reason_code: string;
  readonly created_at: string;
  readonly metadata?: Record<string, unknown> | null;
}

export interface WosM4MaterialSignoffInput {
  readonly orderId: string;
  readonly organizationId: string;
  readonly versionLabel: string;
  readonly transactionVersion: number;
  readonly workflowStatus: string;
  readonly currentBatchQuantity: number;
  readonly resources: readonly WosM4ResourceRecord[];
  readonly blockers: readonly WosM4BlockerRecord[];
  readonly baselines: readonly WosM4BaselineRecord[];
  readonly baselineItems: readonly WosM4BaselineItemRecord[];
  readonly images: readonly WosM4ReferenceImageRecord[];
  readonly profiles: readonly WosM4ProfileRecord[];
  readonly history: readonly WosM4HistoryRecord[];
  readonly readVerified: boolean;
  readonly nowIso: string;
}

export interface WosM4MaterialEvidence {
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly acceptedStatus: string;
  readonly ready: boolean;
  readonly versionLabel: string | null;
  readonly versionMatched: boolean;
  readonly expectedAt: string | null;
  readonly arrivedAt: string | null;
  readonly quantityExpected: number | null;
  readonly quantityArrived: number | null;
  readonly quantityShortfall: number | null;
  readonly confirmerName: string | null;
  readonly confirmerProfileId: string | null;
  readonly confirmerRole: string | null;
  readonly confirmerActive: boolean | null;
  readonly confirmedAt: string | null;
  readonly note: string | null;
  readonly nextEvidence: string;
}

export interface WosM4ImageEvidence {
  readonly id: string;
  readonly category: WosQaImageCategory;
  readonly categoryLabel: string;
  readonly fileName: string;
  readonly versionLabel: string;
  readonly imageStatus: string;
  readonly selectedInCurrentBaseline: boolean;
  readonly required: boolean;
  readonly versionMatched: boolean;
  readonly currentReady: boolean;
  readonly superseded: boolean;
  readonly proofState: 'UNVERIFIED_AUTHENTICATED_RLS_PROOF_READ_UNAVAILABLE';
}

export interface WosM4SignerEvidence {
  readonly role: 'OFFICE' | 'WORKSHOP';
  readonly profileId: string | null;
  readonly displayName: string | null;
  readonly profileRole: string | null;
  readonly active: boolean | null;
  readonly profileVisible: boolean;
  readonly confirmedAt: string | null;
  readonly postOrderVersion: number | null;
  readonly digestPresent: boolean;
}

export interface WosM4M2HistoryAction {
  readonly action:
    | 'QA_M2_BASELINE_SELECT'
    | 'QA_M2_BASELINE_OFFICE_CONFIRM'
    | 'QA_M2_BASELINE_WORKSHOP_CONFIRM'
    | 'QA_M2_FINAL_READINESS_CONFIRM';
  readonly label: string;
  readonly actorRole: string;
  readonly actorProfileId: string | null;
  readonly createdAt: string;
  readonly expectedVersion: number | null;
  readonly newVersion: number | null;
  readonly requestId: string | null;
}

export interface WosM4MaterialSignoffResult {
  readonly source: 'SUPABASE_RLS_SERVER_READ_ONLY';
  readonly versionLabel: string;
  readonly transactionVersion: number;
  readonly workflowStatus: string;
  readonly evaluatedAt: string;
  readonly materials: readonly WosM4MaterialEvidence[];
  readonly readiness: WosP2ReadinessResult;
  readonly currentBaseline: Readonly<{
    id: string | null;
    count: number;
    status: string | null;
    versionLabel: string | null;
    versionMatched: boolean;
    selectedImageCount: number;
    requiredCategoriesComplete: boolean;
    proofSetDigestMatch: boolean;
    independentSigners: boolean;
    signerRoleVerifiedFromHistory: boolean;
    postOrderVersionsValid: boolean;
    office: WosM4SignerEvidence;
    workshop: WosM4SignerEvidence;
    historicalM2EvidenceComplete: boolean;
    currentPrivateProofState: 'UNVERIFIED_AUTHENTICATED_RLS_PROOF_READ_UNAVAILABLE';
  }>;
  readonly images: readonly WosM4ImageEvidence[];
  readonly m2History: Readonly<{
    actions: readonly WosM4M2HistoryAction[];
    chainComplete: boolean;
    issue: string | null;
  }>;
  readonly gaps: readonly string[];
  readonly issues: readonly string[];
  readonly nextAction: string;
  readonly reviewReady: false;
  readonly canStart: false;
}

export type WosM4ImageCategoryState =
  | 'CURRENT_VALID'
  | 'DUPLICATE'
  | 'INVALID'
  | 'MISSING';

export function getWosM4ImageCategoryState(
  result: WosM4MaterialSignoffResult,
  category: WosQaImageCategory,
): WosM4ImageCategoryState {
  const selected = result.images.filter(image =>
    image.category === category && image.selectedInCurrentBaseline);
  if (selected.length > 1) return 'DUPLICATE';
  if (selected.length === 0) return 'MISSING';
  return selected[0].currentReady ? 'CURRENT_VALID' : 'INVALID';
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/i;

type M2ActionReason = WosM4M2HistoryAction['action'];
const M2_ACTIONS: readonly {
  readonly reason: M2ActionReason;
  readonly label: string;
  readonly action: string;
  readonly previousStatus: string;
  readonly nextStatus: string;
  readonly roles: readonly string[];
}[] = [
  {
    reason: 'QA_M2_BASELINE_SELECT',
    label: '选择当前四图 proof-set',
    action: 'BASELINE_SELECT',
    previousStatus: 'WAITING_MATERIAL',
    nextStatus: 'WAITING_MATERIAL',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    reason: 'QA_M2_BASELINE_OFFICE_CONFIRM',
    label: '办公室独立签认',
    action: 'BASELINE_OFFICE_CONFIRM',
    previousStatus: 'WAITING_MATERIAL',
    nextStatus: 'WAITING_MATERIAL',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    reason: 'QA_M2_BASELINE_WORKSHOP_CONFIRM',
    label: '车间独立签认',
    action: 'BASELINE_WORKSHOP_CONFIRM',
    previousStatus: 'WAITING_MATERIAL',
    nextStatus: 'WAITING_MATERIAL',
    roles: ['operator', 'admin', 'manager'],
  },
  {
    reason: 'QA_M2_FINAL_READINESS_CONFIRM',
    label: '最终齐套复核',
    action: 'FINAL_READINESS_CONFIRM',
    previousStatus: 'WAITING_MATERIAL',
    nextStatus: 'READINESS_CHECK',
    roles: ['operator', 'admin', 'manager'],
  },
];

function uuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && uuidPattern.test(value) ? value : null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function maskedProfileId(value: string | null): string | null {
  if (!value || !uuidPattern.test(value)) return null;
  return value.slice(0, 8) + '...' + value.slice(-4);
}

function emptySigner(role: 'OFFICE' | 'WORKSHOP'): WosM4SignerEvidence {
  return {
    role,
    profileId: null,
    displayName: null,
    profileRole: null,
    active: null,
    profileVisible: false,
    confirmedAt: null,
    postOrderVersion: null,
    digestPresent: false,
  };
}

function fallback(
  input: Partial<WosM4MaterialSignoffInput>,
  issue: string,
): WosM4MaterialSignoffResult {
  const now = validDate(input.nowIso) ? input.nowIso! : new Date(0).toISOString();
  const materials = WOS_P2_MATERIALS.map(spec => ({
    code: spec.code,
    title: spec.title,
    status: 'UNKNOWN',
    acceptedStatus: spec.acceptedStatus,
    ready: false,
    versionLabel: null,
    versionMatched: false,
    expectedAt: null,
    arrivedAt: null,
    quantityExpected: null,
    quantityArrived: null,
    quantityShortfall: null,
    confirmerName: null,
    confirmerProfileId: null,
    confirmerRole: null,
    confirmerActive: null,
    confirmedAt: null,
    note: null,
    nextEvidence: '未能取得可信物料记录，禁止视为齐套',
  }));
  const readiness = evaluateWosP2Readiness({
    versionLabel: typeof input.versionLabel === 'string' ? input.versionLabel : '',
    currentBatchQuantity: Number.isSafeInteger(input.currentBatchQuantity)
      ? Number(input.currentBatchQuantity)
      : 0,
    resources: [],
    blockers: [],
    baselines: [],
    readVerified: false,
  });
  return {
    source: 'SUPABASE_RLS_SERVER_READ_ONLY',
    versionLabel: typeof input.versionLabel === 'string' ? input.versionLabel : '',
    transactionVersion: Number.isSafeInteger(input.transactionVersion)
      ? Number(input.transactionVersion)
      : 0,
    workflowStatus: typeof input.workflowStatus === 'string' ? input.workflowStatus : 'UNKNOWN',
    evaluatedAt: now,
    materials,
    readiness,
    currentBaseline: {
      id: null,
      count: 0,
      status: null,
      versionLabel: null,
      versionMatched: false,
      selectedImageCount: 0,
      requiredCategoriesComplete: false,
      proofSetDigestMatch: false,
      independentSigners: false,
      signerRoleVerifiedFromHistory: false,
      postOrderVersionsValid: false,
      office: emptySigner('OFFICE'),
      workshop: emptySigner('WORKSHOP'),
      historicalM2EvidenceComplete: false,
      currentPrivateProofState: 'UNVERIFIED_AUTHENTICATED_RLS_PROOF_READ_UNAVAILABLE',
    },
    images: [],
    m2History: { actions: [], chainComplete: false, issue },
    gaps: [issue],
    issues: [issue],
    nextAction: '刷新真实订单证据；读取失败或范围不完整时不得推进齐套复核。',
    reviewReady: false,
    canStart: false,
  };
}

function signerEvidence(input: {
  readonly role: 'OFFICE' | 'WORKSHOP';
  readonly profileId: string | null;
  readonly confirmedAt: string | null;
  readonly digest: string | null;
  readonly postOrderVersion: number | null;
  readonly profiles: ReadonlyMap<string, WosM4ProfileRecord>;
}): WosM4SignerEvidence {
  const profile = input.profileId ? input.profiles.get(input.profileId) : undefined;
  return {
    role: input.role,
    profileId: maskedProfileId(input.profileId),
    displayName: profile?.full_name?.trim() || null,
    profileRole: profile?.role ?? null,
    active: profile?.is_active ?? null,
    profileVisible: !!profile,
    confirmedAt: validDate(input.confirmedAt) ? input.confirmedAt : null,
    postOrderVersion: integer(input.postOrderVersion),
    digestPresent: typeof input.digest === 'string' && sha256Pattern.test(input.digest),
  };
}

function mapM2History(input: {
  readonly history: readonly WosM4HistoryRecord[];
  readonly currentVersion: number;
  readonly baselineId: string;
  readonly officeProfileId: string | null;
  readonly workshopProfileId: string | null;
  readonly proofDigest: string | null;
}): {
  readonly actions: readonly WosM4M2HistoryAction[];
  readonly valid: boolean;
  readonly signerRolesVerified: boolean;
  readonly issue: string | null;
} {
  const events = input.history.flatMap((row, index) => {
    const definition = M2_ACTIONS.find(action => action.reason === row?.reason_code);
    if (!definition || !validDate(row?.created_at)
      || !definition.roles.includes(row.actor_role)
      || row.previous_status !== definition.previousStatus
      || row.next_status !== definition.nextStatus
      || row.metadata?.action !== definition.action
      || row.metadata?.baselineId !== input.baselineId
      || !uuidOrNull(row.actor_profile_id)) return [];
    const expectedVersion = integer(row.metadata?.expectedVersion);
    const newVersion = integer(row.metadata?.newVersion);
    if (expectedVersion === null || newVersion !== expectedVersion + 1) return [];
    const rawDigest = row.metadata?.proofDigest;
    const proofDigest = typeof rawDigest === 'string' && sha256Pattern.test(rawDigest)
      ? rawDigest
      : null;
    if ((definition.reason === 'QA_M2_BASELINE_SELECT' && rawDigest !== null)
      || (definition.reason !== 'QA_M2_BASELINE_SELECT'
        && (!input.proofDigest || proofDigest !== input.proofDigest))) return [];
    const requestId = uuidOrNull(row.metadata?.requestId);
    if (!requestId) return [];
    return [{
      action: definition.reason,
      label: definition.label,
      actorRole: row.actor_role,
      actorProfileId: row.actor_profile_id,
      createdAt: row.created_at,
      expectedVersion,
      newVersion,
      requestId,
      index,
    }];
  }).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
    || a.index - b.index);
  if (events.length === 0) {
    return {
      actions: [], valid: false, signerRolesVerified: false,
      issue: '没有绑定当前 baseline、proof-set 与状态的 M2 事务历史',
    };
  }
  const duplicate = events.find((event, index) =>
    events.findIndex(candidate =>
      candidate.action === event.action && candidate.newVersion === event.newVersion) !== index);
  if (duplicate) {
    return {
      actions: [],
      valid: false,
      signerRolesVerified: false,
      issue: 'M2 事务历史存在重复版本动作：' + duplicate.label,
    };
  }
  if (new Set(events.map(event => event.requestId)).size !== events.length) {
    return {
      actions: [], valid: false, signerRolesVerified: false,
      issue: 'M2 事务历史存在重复 request ID',
    };
  }
  const finalEvent = [...events].reverse().find(event =>
    event.action === 'QA_M2_FINAL_READINESS_CONFIRM'
    && event.newVersion === input.currentVersion);
  if (!finalEvent) {
    return {
      actions: [], valid: false, signerRolesVerified: false,
      issue: '缺少当前版本的最终齐套 M2 事务',
    };
  }
  const chainReversed = [finalEvent];
  let cursor = finalEvent;
  for (const expected of [...M2_ACTIONS.slice(0, 3)].reverse()) {
    const candidate = [...events].reverse().find(event =>
      event.action === expected.reason
      && event.newVersion === cursor.expectedVersion
      && (Date.parse(event.createdAt) < Date.parse(cursor.createdAt)
        || (event.createdAt === cursor.createdAt && event.index < cursor.index)));
    if (!candidate) {
      return {
        actions: chainReversed.reverse(),
        valid: false,
        signerRolesVerified: false,
        issue: 'M2 事务历史不是当前版本的连续版本链',
      };
    }
    chainReversed.push(candidate);
    cursor = candidate;
  }
  const chain = chainReversed.reverse().map(({ index: _index, ...event }) => event);
  for (let index = 1; index < chain.length; index += 1) {
    if (chain[index - 1].newVersion !== chain[index].expectedVersion) {
      return {
        actions: chain, valid: false, signerRolesVerified: false,
        issue: 'M2 事务历史不是连续版本链',
      };
    }
  }
  const [select, office, workshop, final] = chain;
  const signerRolesVerified = !!input.officeProfileId && !!input.workshopProfileId
    && input.officeProfileId !== input.workshopProfileId
    && !!select.actorProfileId
    && office.actorProfileId === input.officeProfileId
    && workshop.actorProfileId === input.workshopProfileId
    && !!final.actorProfileId;
  if (!signerRolesVerified) {
    return {
      actions: chain, valid: false, signerRolesVerified: false,
      issue: 'M2 事务操作者与 baseline 独立签认人不能可靠对应',
    };
  }
  return {
    actions: chain, valid: true, signerRolesVerified: true, issue: null,
  };
}

export function evaluateWosM4MaterialSignoff(
  input: WosM4MaterialSignoffInput,
): WosM4MaterialSignoffResult {
  if (!input || input.readVerified !== true
    || !uuidPattern.test(input.orderId ?? '')
    || !uuidPattern.test(input.organizationId ?? '')
    || typeof input.versionLabel !== 'string' || !input.versionLabel.trim()
    || !Number.isSafeInteger(input.transactionVersion) || input.transactionVersion < 2
    || !Number.isSafeInteger(input.currentBatchQuantity) || input.currentBatchQuantity < 1
    || !validDate(input.nowIso)
    || !Array.isArray(input.resources) || !Array.isArray(input.blockers)
    || !Array.isArray(input.baselines) || !Array.isArray(input.baselineItems)
    || !Array.isArray(input.images) || !Array.isArray(input.profiles)
    || !Array.isArray(input.history)) {
    return fallback(input ?? {}, 'M4 物料与签样读取范围不完整，禁止认定齐套');
  }
  if (input.resources.some(row =>
    row?.organization_id !== input.organizationId
    || row.entity_type !== 'PRODUCTION_ORDER'
    || row.entity_id !== input.orderId)
    || input.blockers.some(row =>
      row?.organization_id !== input.organizationId
      || row.entity_type !== 'PRODUCTION_ORDER'
      || row.entity_id !== input.orderId)
    || input.baselines.some(row =>
      row?.organization_id !== input.organizationId
      || row.entity_type !== 'PRODUCTION_ORDER'
      || row.entity_id !== input.orderId)
    || input.images.some(row =>
      row?.organization_id !== input.organizationId
      || row.entity_type !== 'PRODUCTION_ORDER'
      || row.entity_id !== input.orderId)
    || input.profiles.some(row => row?.org_id !== input.organizationId)) {
    return fallback(input, 'M4 读取结果包含跨订单或跨组织记录');
  }

  const issues: string[] = [];
  const gaps: string[] = [];
  const readiness = evaluateWosP2Readiness({
    versionLabel: input.versionLabel,
    currentBatchQuantity: input.currentBatchQuantity,
    resources: input.resources,
    blockers: input.blockers,
    baselines: input.baselines,
    readVerified: true,
  });
  const profileMap = new Map<string, WosM4ProfileRecord>();
  for (const profile of input.profiles) {
    if (profile?.id && profile.org_id === input.organizationId
      && uuidPattern.test(profile.id)) {
      profileMap.set(profile.id, profile);
    }
  }
  const hasReadySuperseder = (image: WosM4ReferenceImageRecord): boolean =>
    input.images.some(candidate =>
      candidate.id !== image.id
      && candidate.organization_id === input.organizationId
      && candidate.entity_type === 'PRODUCTION_ORDER'
      && candidate.entity_id === input.orderId
      && candidate.supersedes_image_id === image.id
      && candidate.image_status === 'READY');
  const isCanonicalCurrentImage = (
    image: WosM4ReferenceImageRecord,
  ): boolean => isWosQaImageCategory(image.category)
    && image.organization_id === input.organizationId
    && image.entity_type === 'PRODUCTION_ORDER'
    && image.entity_id === input.orderId
    && image.version_label === input.versionLabel
    && image.image_status === 'READY'
    && image.superseded_at === null
    && !hasReadySuperseder(image)
    && image.storage_bucket === 'wos-private'
    && image.storage_path === buildWosQaImageObjectPath({
      organizationId: input.organizationId,
      orderId: input.orderId,
      versionLabel: input.versionLabel,
      imageId: image.id,
      category: image.category,
    });
  const materials = readiness.materials.map(spec => {
    const defined = WOS_P2_MATERIALS.find(material => material.code === spec.code);
    const acceptedStatus = defined?.acceptedStatus ?? 'UNKNOWN';
    const matches = input.resources.filter(row => row?.resource_type === spec.code);
    const row = matches.length === 1 ? matches[0] : null;
    const profileId = row?.confirmed_by_profile_id ?? null;
    const profile = profileId ? profileMap.get(profileId) : undefined;
    const versionMatched = !!row && row.version_label === input.versionLabel;
    let nextEvidence = '已满足当前版本记录条件；仍需私有无签名 proof 复验与人工齐套复核';
    if (!row) nextEvidence = '登记该类物料并记录真实到位信息';
    else if (matches.length > 1) nextEvidence = '处理重复物料记录后重新读取';
    else if (!versionMatched) nextEvidence = '按当前生产资料版本重新核对物料';
    else if (!profileId || !validDate(row.confirmed_at)) nextEvidence = '补充真实核对人员与确认时间';
    else if (row.status !== acceptedStatus) nextEvidence = '达到 ' + acceptedStatus;
    else if (spec.code === 'INCOMING_MATERIAL'
      && (!Number.isSafeInteger(row.quantity_expected)
        || !Number.isSafeInteger(row.quantity_arrived)
        || Number(row.quantity_arrived) < Number(row.quantity_expected)
        || Number(row.quantity_arrived) < input.currentBatchQuantity)) {
      nextEvidence = '补齐本批数量并完成实到数量核对';
    }
    return {
      code: spec.code,
      title: spec.title,
      status: row?.status || 'NOT_RECORDED',
      acceptedStatus,
      ready: spec.ready,
      versionLabel: row?.version_label ?? null,
      versionMatched,
      expectedAt: row && validDate(row.expected_at) ? row.expected_at : null,
      arrivedAt: row && validDate(row.arrived_at) ? row.arrived_at : null,
      quantityExpected: row && Number.isSafeInteger(row.quantity_expected)
        ? Number(row.quantity_expected) : null,
      quantityArrived: row && Number.isSafeInteger(row.quantity_arrived)
        ? Number(row.quantity_arrived) : null,
      quantityShortfall: spec.code === 'INCOMING_MATERIAL'
        && row && Number.isSafeInteger(row.quantity_expected)
        && Number.isSafeInteger(row.quantity_arrived)
        ? Math.max(0, Math.max(
          Number(row.quantity_expected),
          input.currentBatchQuantity,
        ) - Number(row.quantity_arrived))
        : null,
      confirmerName: profile?.full_name?.trim() || null,
      confirmerProfileId: maskedProfileId(profileId),
      confirmerRole: profile?.role ?? null,
      confirmerActive: profile?.is_active ?? null,
      confirmedAt: row && validDate(row.confirmed_at) ? row.confirmed_at : null,
      note: typeof row?.note === 'string' ? row.note : null,
      nextEvidence,
    };
  });
  for (const material of materials) {
    if (!material.ready) gaps.push(material.title + '：' + material.nextEvidence);
  }

  const baselines = input.baselines.filter(row =>
    row?.organization_id === input.organizationId
    && row.entity_type === 'PRODUCTION_ORDER'
    && row.entity_id === input.orderId);
  if (baselines.length !== input.baselines.length) {
    issues.push('存在不属于当前订单或组织的视觉基准记录');
  }
  const current = baselines.filter(row =>
    row.status === 'CURRENT' && row.superseded_at === null);
  const baseline = current.length === 1 ? current[0] : null;
  if (current.length !== 1) {
    issues.push(current.length === 0 ? '尚未建立 CURRENT 图片基准' : '存在多个 CURRENT 图片基准');
    gaps.push('建立且仅保留一个当前版本 CURRENT 图片基准');
  }

  const baselineItems = baseline
    ? input.baselineItems.filter(item => item?.baseline_id === baseline.id)
    : [];
  const selectedIds = new Set<string>();
  for (const item of baselineItems) {
    if (uuidPattern.test(item.reference_image_id)) selectedIds.add(item.reference_image_id);
  }
  const baselineImages = baselineItems.map(item =>
    input.images.filter(image => image?.id === item.reference_image_id));
  const oneImageEach = baselineImages.every(matches => matches.length === 1);
  const exactFourDistinctImages = baselineItems.length === 4
    && selectedIds.size === 4;
  const validImages = oneImageEach && baselineImages.every(([image]) =>
    isCanonicalCurrentImage(image));
  const categoryCounts = new Map<WosQaImageCategory, number>();
  for (const [image] of baselineImages) {
    const category = image?.category;
    if (image && isCanonicalCurrentImage(image) && isWosQaImageCategory(category)) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }
  const requiredCategoriesComplete = exactFourDistinctImages
    && validImages
    && WOS_QA_IMAGE_CATEGORIES.every(category => categoryCounts.get(category) === 1);
  const baselineVersionMatched = !!baseline
    && baseline.version_label === input.versionLabel;
  const office = signerEvidence({
    role: 'OFFICE',
    profileId: baseline?.confirmed_by_office_profile_id ?? null,
    confirmedAt: baseline?.office_confirmed_at ?? null,
    digest: baseline?.office_proof_set_digest ?? null,
    postOrderVersion: baseline?.office_post_order_version ?? null,
    profiles: profileMap,
  });
  const workshop = signerEvidence({
    role: 'WORKSHOP',
    profileId: baseline?.confirmed_by_workshop_profile_id ?? null,
    confirmedAt: baseline?.workshop_confirmed_at ?? null,
    digest: baseline?.workshop_proof_set_digest ?? null,
    postOrderVersion: baseline?.workshop_post_order_version ?? null,
    profiles: profileMap,
  });
  const baselineCreatedAt = baseline && validDate(baseline.created_at)
    ? Date.parse(baseline.created_at) : Number.NaN;
  const signersWithinBaseline = !!baseline
    && office.digestPresent && workshop.digestPresent
    && !!baseline.confirmed_by_office_profile_id
    && !!baseline.confirmed_by_workshop_profile_id
    && baseline.confirmed_by_office_profile_id
      !== baseline.confirmed_by_workshop_profile_id
    && !!office.confirmedAt && !!workshop.confirmedAt
    && Date.parse(office.confirmedAt) >= baselineCreatedAt
    && Date.parse(workshop.confirmedAt) >= Date.parse(office.confirmedAt);
  const resolvedProfileRolesCompatible = (!office.profileVisible
      || (office.active === true
        && ['admin', 'manager', 'sales'].includes(office.profileRole ?? '')))
    && (!workshop.profileVisible
      || (workshop.active === true
        && ['admin', 'manager', 'operator'].includes(workshop.profileRole ?? '')));
  const proofSetDigestMatch = !!baseline
    && office.digestPresent && workshop.digestPresent
    && baseline.office_proof_set_digest === baseline.workshop_proof_set_digest;
  const postOrderVersionsValid = !!baseline
    && office.postOrderVersion !== null && workshop.postOrderVersion !== null
    && workshop.postOrderVersion === office.postOrderVersion + 1
    && workshop.postOrderVersion <= input.transactionVersion;
  const historyChain = baseline
    ? mapM2History({
      history: input.history,
      currentVersion: input.transactionVersion,
      baselineId: baseline.id,
      officeProfileId: baseline.confirmed_by_office_profile_id,
      workshopProfileId: baseline.confirmed_by_workshop_profile_id,
      proofDigest: baseline.office_proof_set_digest,
    })
    : {
      actions: [], valid: false, signerRolesVerified: false,
      issue: '没有 CURRENT 基准，无法绑定 M2 事务历史',
    };
  const independentSigners = signersWithinBaseline
    && resolvedProfileRolesCompatible
    && historyChain.signerRolesVerified;
  const historyVersionsMatch = !!baseline
    && historyChain.valid
    && historyChain.actions[0]?.newVersion === (office.postOrderVersion ?? -1) - 1
    && historyChain.actions[1]?.newVersion === office.postOrderVersion
    && historyChain.actions[2]?.newVersion === workshop.postOrderVersion
    && historyChain.actions[3]?.newVersion === input.transactionVersion;
  const historicalM2EvidenceComplete = readiness.materialsVerified
    && baselineVersionMatched
    && exactFourDistinctImages
    && baselineItems.every(item => item.is_required === true)
    && validImages && requiredCategoriesComplete
    && independentSigners && proofSetDigestMatch
    && postOrderVersionsValid && historyVersionsMatch;
  if (baseline && !baselineVersionMatched) {
    issues.push('CURRENT 基准版本与订单生产资料版本不一致');
  }
  if (baseline && !validImages) {
    issues.push('基准关联图片不是当前版本的有效私有图片记录');
  }
  if (baseline && !requiredCategoriesComplete) {
    issues.push('当前基准必须恰好包含四张不同图片，且四个必需类别各一张');
    gaps.push('修正 CURRENT 基准为四张不同图片，PRODUCT / FILM_PATTERN / SIGNED_SAMPLE / CUSTOMER_APPROVED_SAMPLE 各一张');
  }
  if (baseline && !independentSigners) {
    issues.push('Office / Workshop 独立双签缺失、同人或时序异常');
  }
  if (baseline && !proofSetDigestMatch) {
    issues.push('Office / Workshop proof-set 摘要不一致');
  }
  if (baseline && !postOrderVersionsValid) {
    issues.push('双签绑定的订单数字版本不连续');
  }
  if (baseline && !historyVersionsMatch) {
    issues.push(historyChain.issue ?? 'M2 事务历史与 baseline 双签版本不一致');
  }
  if (baseline && !historicalM2EvidenceComplete) {
    gaps.push('补齐当前版本四图 proof-set、独立双签及连续 M2 事务历史');
  }
  if (!historicalM2EvidenceComplete) {
    const currentImages = input.images.filter(image =>
      image?.organization_id === input.organizationId
      && image.entity_id === input.orderId
      && image.entity_type === 'PRODUCTION_ORDER');
    if (currentImages.length > 0
      && currentImages.every(image => image.version_label !== input.versionLabel)) {
      issues.push('已有图片均不属于当前生产资料版本，不能作为现版签样依据');
      gaps.push('补齐 ' + input.versionLabel + ' 当前版本的四类图片与私有对象证明');
    }
  }

  const imageEvidence: WosM4ImageEvidence[] = [];
  for (const image of input.images) {
    const category = image?.category;
    if (!image || image.organization_id !== input.organizationId
      || image.entity_id !== input.orderId
      || image.entity_type !== 'PRODUCTION_ORDER'
      || !isWosQaImageCategory(category)) continue;
    imageEvidence.push({
      id: image.id,
      category,
      categoryLabel: WOS_QA_IMAGE_CATEGORY_LABELS[category],
      fileName: image.file_name,
      versionLabel: image.version_label,
      imageStatus: image.image_status,
      selectedInCurrentBaseline: selectedIds.has(image.id),
      required: input.baselineItems.some(item =>
        item.baseline_id === baseline?.id
        && item.reference_image_id === image.id && item.is_required),
      versionMatched: image.version_label === input.versionLabel,
      currentReady: isCanonicalCurrentImage(image),
      superseded: image.superseded_at !== null,
      proofState: 'UNVERIFIED_AUTHENTICATED_RLS_PROOF_READ_UNAVAILABLE',
    });
  }
  issues.push('普通 authenticated RLS 无权读取私有图片 proof 与 M2 回执，当前 proof 有效性无法在此读模型中重新认证');
  gaps.push('需独立授权只读复核当前版本 private proof/Storage object；不得沿用旧签认或自动放行');

  const nextAction = gaps.length > 0
    ? gaps[0]
    : '准备独立只读 proof 复核与人工齐套审核；本页面不允许自动开工。';
  return {
    source: 'SUPABASE_RLS_SERVER_READ_ONLY',
    versionLabel: input.versionLabel,
    transactionVersion: input.transactionVersion,
    workflowStatus: input.workflowStatus,
    evaluatedAt: input.nowIso,
    materials,
    readiness,
    currentBaseline: {
      id: baseline?.id ?? null,
      count: current.length,
      status: baseline?.status ?? null,
      versionLabel: baseline?.version_label ?? null,
      versionMatched: baselineVersionMatched,
      selectedImageCount: selectedIds.size,
      requiredCategoriesComplete,
      proofSetDigestMatch,
      independentSigners,
      signerRoleVerifiedFromHistory: historyChain.signerRolesVerified,
      postOrderVersionsValid,
      office,
      workshop,
      historicalM2EvidenceComplete,
      currentPrivateProofState: 'UNVERIFIED_AUTHENTICATED_RLS_PROOF_READ_UNAVAILABLE',
    },
    images: imageEvidence,
    m2History: {
      actions: historyChain.actions,
      chainComplete: historyVersionsMatch,
      issue: historyChain.issue,
    },
    gaps,
    issues: Array.from(new Set(issues)),
    nextAction,
    reviewReady: false,
    canStart: false,
  };
}
