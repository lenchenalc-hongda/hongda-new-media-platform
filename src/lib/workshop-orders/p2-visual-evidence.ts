/**
 * Candidate current-image baseline inspection for P2 QA.
 *
 * An uploaded file, a verified private object, a CURRENT selection, Office
 * acknowledgment and Workshop acknowledgment are distinct stages. The
 * browser must NOT promote a candidate to production-start authorization.
 * DB writer/immutability and independent reviewer are intentionally absent
 * until separately approved.
 */
export interface WosP2VisualBaselineCandidate {
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
}
export interface WosP2BaselineItemCandidate {
  readonly baseline_id: string;
  readonly reference_image_id: string;
  readonly is_required: boolean;
}
export interface WosP2ReferenceImageCandidate {
  readonly id: string;
  readonly organization_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly category: string;
  readonly version_label: string;
  readonly image_status: string;
  readonly storage_bucket: string;
  readonly storage_path: string;
  readonly superseded_at: string | null;
}
export interface WosP2ImageProofCandidate {
  readonly image_id: string;
  readonly organization_id: string;
  readonly order_id: string;
  readonly storage_bucket: string;
  readonly storage_path: string;
  readonly storage_object_id: string;
  readonly storage_object_version: string;
  readonly verified_sha256: string;
  readonly verified_at: string;
  readonly expires_at: string;
}
export interface WosP2VisualEvidenceInput {
  readonly orderId: string;
  readonly organizationId: string;
  readonly productionVersionLabel: string;
  readonly requiredCategories: readonly string[];
  readonly baselines: readonly WosP2VisualBaselineCandidate[];
  readonly items: readonly WosP2BaselineItemCandidate[];
  readonly images: readonly WosP2ReferenceImageCandidate[];
  readonly proofs: readonly WosP2ImageProofCandidate[];
  readonly readVerified: boolean;
  readonly nowIso: string;
}
export interface WosP2VisualEvidenceAssessment {
  readonly candidateCurrentBaselineComplete: boolean;
  readonly officeAcknowledged: boolean;
  readonly workshopAcknowledged: boolean;
  readonly imagesVerified: boolean;
  readonly issues: readonly string[];
  readonly canStart: false;
  readonly source: 'QA_RLS_CANDIDATE_ONLY';
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;
// Image categories are NOT material resource_types; mirror live QA CHECK constraint.
const categorySet = new Set(['PRODUCT','FILM_PATTERN','CUSTOMER_APPROVED_SAMPLE','SIGNED_SAMPLE','SAMPLING_RESULT','PACKAGING_LABEL','DEFECT_RISK','OTHER']);

function millis(x: unknown): number {
  return typeof x === 'string' && x.length > 0 ? Date.parse(x) : Number.NaN;
}

export function assessWosP2VisualEvidence(input: WosP2VisualEvidenceInput): WosP2VisualEvidenceAssessment {
  const issues: string[] = [];
  const result = (complete: boolean, office: boolean, workshop: boolean, images: boolean): WosP2VisualEvidenceAssessment => ({
    candidateCurrentBaselineComplete: complete && issues.length === 0,
    officeAcknowledged: office,
    workshopAcknowledged: workshop,
    imagesVerified: images,
    issues,
    canStart: false,
    source: 'QA_RLS_CANDIDATE_ONLY',
  });
  if (!input || input.readVerified !== true ||
      !uuid.test(input.orderId || '') || !uuid.test(input.organizationId || '') ||
      typeof input.productionVersionLabel !== 'string' || !input.productionVersionLabel.trim() ||
      !Array.isArray(input.baselines) || !Array.isArray(input.items) ||
      !Array.isArray(input.images) || !Array.isArray(input.proofs) ||
      !Array.isArray(input.requiredCategories) || !Number.isFinite(millis(input.nowIso))) {
    issues.push('图片及基准的 QA RLS 查询不完整、订单范围错误或时钟无效');
    return result(false,false,false,false);
  }
  const categories = input.requiredCategories;
  if (categories.length === 0 || new Set(categories).size !== categories.length ||
      categories.some(c => !categorySet.has(c))) {
    issues.push('当前订单要求的图片类别未完整定义或存在重复');
    return result(false,false,false,false);
  }
  const current = input.baselines.filter(b => b?.status === 'CURRENT');
  if (current.length !== 1) {
    issues.push('必须且只能有一个 CURRENT 生产基准');
    return result(false,false,false,false);
  }
  const b=current[0];
  const scope = b.organization_id === input.organizationId
    && b.entity_id === input.orderId && b.entity_type === 'PRODUCTION_ORDER'
    && b.version_label === input.productionVersionLabel
    && uuid.test(b.id) && b.superseded_at === null;
  if (!scope) issues.push('生产基准的组织、订单、生产版本或替代状态不匹配');
  const created = millis(b.created_at);
  const now=millis(input.nowIso);
  const officeTime=millis(b.office_confirmed_at);
  const workshopTime=millis(b.workshop_confirmed_at);
  const office = scope && uuid.test(b.confirmed_by_office_profile_id ?? '') &&
    Number.isFinite(created) && Number.isFinite(officeTime) &&
    officeTime >= created && officeTime <= now;
  const workshop = scope && uuid.test(b.confirmed_by_workshop_profile_id ?? '') &&
    b.confirmed_by_workshop_profile_id !== b.confirmed_by_office_profile_id &&
    Number.isFinite(workshopTime) && workshopTime >= created && workshopTime <= now;
  if (!office) issues.push('当前版本办公室独立签认缺失或早于生产基准');
  if (!workshop) issues.push('当前版本车间独立复核缺失、与办公室同人或时间异常');

  const selected = input.items.filter(it => it?.baseline_id === b.id);
  if (selected.length === 0 || selected.some(it => !uuid.test(it.reference_image_id))) {
    issues.push('当前生产基准缺少有效关联图片');
  }
  if (input.items.some(it => it?.baseline_id !== b.id &&
       !input.baselines.some(old=>old?.id===it.baseline_id))) {
    issues.push('存在未绑定到本订单基准的图片项目');
  }
  const selectedIds=new Set(selected.map(it=>it.reference_image_id));
  if (selectedIds.size!==selected.length) issues.push('图片在当前基准中重复关联');
  const mapped = selected.map(it => input.images.filter(img => img?.id === it.reference_image_id));
  const goodImages = mapped.every(matches => matches.length===1 && matches[0].organization_id===input.organizationId &&
    matches[0].entity_id===input.orderId && matches[0].entity_type==='PRODUCTION_ORDER' &&
    matches[0].version_label===input.productionVersionLabel &&
    matches[0].image_status==='READY' && matches[0].superseded_at===null &&
    matches[0].storage_bucket==='wos-private' && matches[0].storage_path.length>0);
  if (!goodImages) issues.push('图片未完成上传、防错版本或私有对象的有效核对');

  let proofsComplete = selected.length>0 && goodImages;
  for (const it of selected) {
    const img=input.images.find(x=>x.id===it.reference_image_id);
    const ps=input.proofs.filter(p=>p?.image_id===it.reference_image_id);
    const p=ps.length===1 ? ps[0] : null;
    const valid=!!img && !!p && p.organization_id===input.organizationId &&
      p.order_id===input.orderId && p.storage_bucket===img.storage_bucket &&
      p.storage_path===img.storage_path && uuid.test(p.storage_object_id) &&
      typeof p.storage_object_version==='string' && p.storage_object_version.length>0 &&
      typeof p.verified_sha256==='string' && sha256.test(p.verified_sha256) &&
      Number.isFinite(millis(p.verified_at)) && millis(p.verified_at)<=now &&
      Number.isFinite(millis(p.expires_at)) && millis(p.expires_at)>now;
    if (!valid) proofsComplete=false;
  }
  if (!proofsComplete) issues.push('当前基准的图片缺少独立有效的私有对象 SHA-256 证明');

  for (const category of categories) {
    const hits=selected.filter(it=>it.is_required===true &&
      input.images.some(img=>img.id===it.reference_image_id && img.category===category));
    if (hits.length===0) issues.push('缺少当前版本必需图片类别：'+category);
  }
  // A valid image proof does NOT establish physical signed-sample receipt or
  // technical/manager start approval; the assessment remains non-executable.
  return result(scope && office && workshop && proofsComplete,office,workshop,proofsComplete);
}
