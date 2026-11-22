import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  evaluateWosM4MaterialSignoff,
  getWosM4ImageCategoryState,
  type WosM4MaterialSignoffInput,
} from '../../src/lib/workshop-orders/m4-material-signoff';
import {
  WOS_READ_ROLES,
  resolveWosApiActor,
} from '../../src/lib/workshop-orders/api-contract';
import {
  WOS_QA_IMAGE_CATEGORIES,
  buildWosQaImageObjectPath,
} from '../../src/lib/workshop-orders/qa-image-categories';

const org = '0ff53d93-2b9e-48b9-8113-a4768c39cdd2';
const foreignOrg = 'fbdb0989-ae25-4ba4-92f9-3266cc845977';
const orderId = '953d2204-3e65-4b75-b10e-c6e97f1bbb56';
const baselineId = 'c7a671c5-43f5-4068-b9a6-ce29759db204';
const officeProfile = 'f8adf44a-f04e-44b4-9c82-8b96508097bb';
const workshopProfile = 'f6ec4b7f-716a-4a67-a1c9-a46fc6fc8d23';
const imageIds = [
  '308ba162-1445-4b51-aec4-6c2c9cd45151',
  'afdcfed5-754c-4da6-957e-d160fd75087b',
  'a4d3160a-9a00-4bea-a85d-d51ef45b2419',
  'f7f8d7df-4939-4f91-9323-7db6388d31f5',
] as const;
const categories = [
  'CUSTOMER_APPROVED_SAMPLE',
  'FILM_PATTERN',
  'PRODUCT',
  'SIGNED_SAMPLE',
] as const;
const now = '2026-11-22T08:00:00.000Z';
const digest = '273127ee4db299e6014f73220158291d21d338f20586a1b5e51a4bbccda25805';

function baseInput(): WosM4MaterialSignoffInput {
  return {
    orderId,
    organizationId: org,
    versionLabel: 'QA-R6',
    transactionVersion: 11,
    workflowStatus: 'READINESS_CHECK',
    currentBatchQuantity: 101,
    readVerified: true,
    nowIso: now,
    resources: [
      ['FILM', 'VERSION_VERIFIED'],
      ['FIXTURE', 'FIT_VERIFIED'],
      ['INCOMING_MATERIAL', 'QUANTITY_VERIFIED'],
      ['SIGNED_SAMPLE', 'VERIFIED'],
    ].map(([resource_type, status]) => ({
      organization_id: org,
      entity_type: 'PRODUCTION_ORDER',
      entity_id: orderId,
      resource_type,
      status,
      version_label: 'QA-R6',
      quantity_expected: resource_type === 'INCOMING_MATERIAL' ? 101 : null,
      quantity_arrived: resource_type === 'INCOMING_MATERIAL' ? 101 : null,
      expected_at: null,
      arrived_at: '2026-11-21T10:09:31.000Z',
      confirmed_by_profile_id: workshopProfile,
      confirmed_at: '2026-11-21T10:09:33.000Z',
      note: '四类物料与当前 proof-set 已完成最终实物核对',
    })),
    blockers: [],
    baselines: [{
      id: baselineId,
      organization_id: org,
      entity_type: 'PRODUCTION_ORDER',
      entity_id: orderId,
      version_label: 'QA-R6',
      status: 'CURRENT',
      confirmed_by_office_profile_id: officeProfile,
      confirmed_by_workshop_profile_id: workshopProfile,
      office_confirmed_at: '2026-11-21T10:05:04.000Z',
      workshop_confirmed_at: '2026-11-21T10:08:57.000Z',
      created_at: '2026-11-21T10:04:22.000Z',
      superseded_at: null,
      office_proof_set_digest: digest,
      office_post_order_version: 9,
      workshop_proof_set_digest: digest,
      workshop_post_order_version: 10,
    }],
    baselineItems: imageIds.map((id, index) => ({
      baseline_id: baselineId,
      reference_image_id: id,
      display_order: index,
      is_required: true,
    })),
    images: imageIds.map((id, index) => ({
      id,
      organization_id: org,
      entity_type: 'PRODUCTION_ORDER',
      entity_id: orderId,
      category: categories[index],
      version_label: 'QA-R6',
      image_status: 'READY',
      file_name: categories[index].toLowerCase() + '.png',
      uploaded_at: '2026-11-21T10:04:06.000Z',
      superseded_at: null,
      supersedes_image_id: null,
      storage_bucket: 'wos-private',
      storage_path: buildWosQaImageObjectPath({
        organizationId: org,
        orderId,
        versionLabel: 'QA-R6',
        imageId: id,
        category: categories[index],
      }),
    })),
    profiles: [
      {
        id: officeProfile,
        org_id: org,
        full_name: 'Preview Smoke Admin',
        role: 'admin',
        is_active: true,
      },
      {
        id: workshopProfile,
        org_id: org,
        full_name: 'WOS QA Operator',
        role: 'operator',
        is_active: true,
      },
    ],
    history: [
      ['QA_M2_BASELINE_SELECT', 7, 8, 'admin', '2026-11-21T10:04:22.000Z'],
      ['QA_M2_BASELINE_OFFICE_CONFIRM', 8, 9, 'admin', '2026-11-21T10:05:04.000Z'],
      ['QA_M2_BASELINE_WORKSHOP_CONFIRM', 9, 10, 'operator', '2026-11-21T10:08:57.000Z'],
      ['QA_M2_FINAL_READINESS_CONFIRM', 10, 11, 'operator', '2026-11-21T10:09:33.000Z'],
    ].map(([reason_code, expectedVersion, newVersion, actor_role, created_at], index) => ({
      previous_status: 'WAITING_MATERIAL',
      next_status: reason_code === 'QA_M2_FINAL_READINESS_CONFIRM'
        ? 'READINESS_CHECK' : 'WAITING_MATERIAL',
      actor_profile_id: index < 2 ? officeProfile : workshopProfile,
      actor_role: String(actor_role),
      reason_code: String(reason_code),
      created_at: String(created_at),
      metadata: {
        action: String(reason_code).replace('QA_M2_', ''),
        baselineId,
        expectedVersion: Number(expectedVersion),
        newVersion: Number(newVersion),
        proofDigest: reason_code === 'QA_M2_BASELINE_SELECT' ? null : digest,
        requestId: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
        ][index],
      },
    })),
  };
}

function replaceMaterial(
  input: WosM4MaterialSignoffInput,
  type: string,
  patch: Record<string, unknown>,
): WosM4MaterialSignoffInput {
  return {
    ...input,
    resources: input.resources.map(row =>
      row.resource_type === type ? { ...row, ...patch } : row),
  };
}

const base = evaluateWosM4MaterialSignoff(baseInput());
assert.equal(base.currentBaseline.historicalM2EvidenceComplete, true);
assert.equal(base.currentBaseline.proofSetDigestMatch, true);
assert.equal(base.currentBaseline.independentSigners, true);
assert.equal(base.currentBaseline.requiredCategoriesComplete, true);
assert.equal(base.currentBaseline.currentPrivateProofState,
  'UNVERIFIED_AUTHENTICATED_RLS_PROOF_READ_UNAVAILABLE');
assert.equal(base.m2History.chainComplete, true);
assert.equal(base.reviewReady, false);
assert.equal(base.canStart, false);
assert.equal(base.materials.every(material => material.ready), true);
assert.equal(WOS_QA_IMAGE_CATEGORIES.every(category =>
  getWosM4ImageCategoryState(base, category) === 'CURRENT_VALID'), true);

const fifthProductImage = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  organization_id: org,
  entity_type: 'PRODUCTION_ORDER',
  entity_id: orderId,
  category: 'PRODUCT',
  version_label: 'QA-R6',
  image_status: 'READY',
  file_name: 'duplicate-product.png',
  uploaded_at: '2026-11-21T10:04:16.000Z',
  superseded_at: null,
  supersedes_image_id: null,
  storage_bucket: 'wos-private',
  storage_path: buildWosQaImageObjectPath({
    organizationId: org,
    orderId,
    versionLabel: 'QA-R6',
    imageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    category: 'PRODUCT',
  }),
};
const duplicateProduct = evaluateWosM4MaterialSignoff({
  ...baseInput(),
  images: [...baseInput().images, fifthProductImage],
  baselineItems: [...baseInput().baselineItems, {
    baseline_id: baselineId,
    reference_image_id: fifthProductImage.id,
    display_order: 4,
    is_required: true,
  }],
});
assert.equal(duplicateProduct.currentBaseline.selectedImageCount, 5);
assert.equal(duplicateProduct.currentBaseline.requiredCategoriesComplete, false);
assert.equal(duplicateProduct.currentBaseline.historicalM2EvidenceComplete, false);
assert.equal(getWosM4ImageCategoryState(duplicateProduct, 'PRODUCT'), 'DUPLICATE');
assert(duplicateProduct.gaps.some(gap => gap.includes('四张不同图片')));

const duplicateSignedSample = evaluateWosM4MaterialSignoff({
  ...baseInput(),
  images: [...baseInput().images, {
    ...fifthProductImage,
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    category: 'SIGNED_SAMPLE',
    file_name: 'duplicate-signed-sample.png',
    storage_path: buildWosQaImageObjectPath({
      organizationId: org,
      orderId,
      versionLabel: 'QA-R6',
      imageId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      category: 'SIGNED_SAMPLE',
    }),
  }],
  baselineItems: [...baseInput().baselineItems, {
    baseline_id: baselineId,
    reference_image_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    display_order: 4,
    is_required: true,
  }],
});
assert.equal(duplicateSignedSample.currentBaseline.requiredCategoriesComplete, false);
assert.equal(duplicateSignedSample.currentBaseline.historicalM2EvidenceComplete, false);
assert.equal(getWosM4ImageCategoryState(duplicateSignedSample, 'SIGNED_SAMPLE'), 'DUPLICATE');

const duplicateAndMissingCategory = evaluateWosM4MaterialSignoff({
  ...baseInput(),
  images: baseInput().images.map((image, index) =>
    index === 1 ? {...image, category: 'PRODUCT'} : image),
});
assert.equal(duplicateAndMissingCategory.currentBaseline.requiredCategoriesComplete, false);
assert.equal(duplicateAndMissingCategory.currentBaseline.historicalM2EvidenceComplete, false);
assert.equal(getWosM4ImageCategoryState(duplicateAndMissingCategory, 'PRODUCT'), 'DUPLICATE');
assert.equal(getWosM4ImageCategoryState(duplicateAndMissingCategory, 'FILM_PATTERN'), 'MISSING');

const duplicateReferenceImage = evaluateWosM4MaterialSignoff({
  ...baseInput(),
  baselineItems: baseInput().baselineItems.map((item, index) =>
    index === 3 ? {...item, reference_image_id: imageIds[2]} : item),
});
assert.equal(duplicateReferenceImage.currentBaseline.selectedImageCount, 3);
assert.equal(duplicateReferenceImage.currentBaseline.requiredCategoriesComplete, false);
assert.equal(duplicateReferenceImage.currentBaseline.historicalM2EvidenceComplete, false);

const rlsHiddenOfficeProfile = evaluateWosM4MaterialSignoff({
  ...baseInput(),
  profiles: baseInput().profiles.filter(profile => profile.id !== officeProfile),
});
assert.equal(rlsHiddenOfficeProfile.currentBaseline.office.profileVisible, false);
assert.equal(rlsHiddenOfficeProfile.currentBaseline.signerRoleVerifiedFromHistory, true);
assert.equal(rlsHiddenOfficeProfile.currentBaseline.historicalM2EvidenceComplete, true);
const priorCycle = baseInput().history.map((row, index) => ({
  ...row,
  created_at: '2026-11-20T09:00:00.000Z',
  metadata: {
    ...row.metadata,
    expectedVersion: Number(row.metadata?.expectedVersion) - 4,
    newVersion: Number(row.metadata?.newVersion) - 4,
    requestId: [
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
      '88888888-8888-4888-8888-888888888888',
    ][index],
  },
}));
const latestCycle = evaluateWosM4MaterialSignoff({
  ...baseInput(),
  history: [...priorCycle, ...baseInput().history],
});
assert.equal(latestCycle.currentBaseline.historicalM2EvidenceComplete, true);
assert.equal(latestCycle.m2History.actions[0]?.newVersion, 8);
assert.equal((WOS_READ_ROLES as readonly string[]).includes('viewer'), false);
assert.deepEqual(resolveWosApiActor(officeProfile, {
  id: officeProfile,
  user_id: officeProfile,
  org_id: org,
  role: 'viewer',
  is_active: true,
}), { ok: false, code: 'FORBIDDEN', status: 403 });

const missing = evaluateWosM4MaterialSignoff({
  ...baseInput(),
  resources: [],
  baselines: [],
  baselineItems: [],
  images: [{
    id: 'eb427d70-1812-4c90-81d8-d2f40bef1815',
    organization_id: org,
    entity_type: 'PRODUCTION_ORDER',
    entity_id: '2071a963-1b35-4c96-81cd-709d8180ad49',
    category: 'PRODUCT',
    version_label: 'V1',
    image_status: 'READY',
    file_name: 'qa-preview-proof.png',
    uploaded_at: '2026-11-17T12:18:53.000Z',
    superseded_at: null,
    supersedes_image_id: null,
    storage_bucket: 'wos-private',
    storage_path: buildWosQaImageObjectPath({
      organizationId: org,
      orderId: '2071a963-1b35-4c96-81cd-709d8180ad49',
      versionLabel: 'V1',
      imageId: 'eb427d70-1812-4c90-81d8-d2f40bef1815',
      category: 'PRODUCT',
    }),
  }],
  profiles: [],
  history: [],
  orderId: '2071a963-1b35-4c96-81cd-709d8180ad49',
  versionLabel: 'QA-R6',
  transactionVersion: 7,
  workflowStatus: 'WAITING_MATERIAL',
  currentBatchQuantity: 60,
});
assert.equal(missing.materials.every(material => !material.ready), true);
assert.equal(missing.currentBaseline.count, 0);
assert.equal(missing.currentBaseline.historicalM2EvidenceComplete, false);
assert(missing.gaps.some(gap => gap.includes('CURRENT')));
assert.equal(missing.canStart, false);

const failures: Array<[string, WosM4MaterialSignoffInput]> = [
  ['1 all materials absent', {...baseInput(), resources: []}],
  ['2 only film present', {...baseInput(), resources: baseInput().resources.slice(0, 1)}],
  ['3 film arrived but version unverified',
    replaceMaterial(baseInput(), 'FILM', { status: 'ARRIVED' })],
  ['4 fixture arrived but fit unverified',
    replaceMaterial(baseInput(), 'FIXTURE', { status: 'ARRIVED' })],
  ['5 incoming quantity short',
    replaceMaterial(baseInput(), 'INCOMING_MATERIAL', { quantity_arrived: 100 })],
  ['6 signed sample uploaded but not verified',
    replaceMaterial(baseInput(), 'SIGNED_SAMPLE', { status: 'UPLOADED' })],
  ['7 missing material confirmer',
    replaceMaterial(baseInput(), 'FIXTURE', { confirmed_by_profile_id: null })],
  ['8 resource from another order', {
    ...baseInput(),
    resources: baseInput().resources.map(row => ({...row, entity_id: orderId.replace(/\d$/, '0')})),
  }],
  ['9 duplicate resource', {
    ...baseInput(),
    resources: [...baseInput().resources, baseInput().resources[0]],
  }],
  ['10 unknown resource state',
    replaceMaterial(baseInput(), 'SIGNED_SAMPLE', { status: 'UNKNOWN_FUTURE_STATE' })],
  ['11 old V1 image cannot serve QA-R6', {
    ...baseInput(),
    baselineItems: [],
    baselines: [],
    images: baseInput().images.map(image => ({...image, version_label: 'V1'})),
  }],
  ['12 superseded baseline image', {
    ...baseInput(),
    images: baseInput().images.map((image, index) =>
      index === 0 ? {...image, superseded_at: now} : image),
  }],
  ['13 multiple CURRENT baselines', {
    ...baseInput(),
    baselines: [
      baseInput().baselines[0],
      {...baseInput().baselines[0], id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},
    ],
  }],
  ['14 missing required image category', {
    ...baseInput(),
    baselineItems: baseInput().baselineItems.slice(0, 3),
  }],
  ['15 image not associated to current baseline', {
    ...baseInput(),
    baselineItems: baseInput().baselineItems.map((item, index) =>
      index === 0 ? {...item, baseline_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'} : item),
  }],
  ['16 Office signer missing', {
    ...baseInput(),
    baselines: [{
      ...baseInput().baselines[0],
      confirmed_by_office_profile_id: null,
      office_confirmed_at: null,
      office_proof_set_digest: null,
      office_post_order_version: null,
    }],
  }],
  ['17 Workshop signer missing', {
    ...baseInput(),
    baselines: [{
      ...baseInput().baselines[0],
      confirmed_by_workshop_profile_id: null,
      workshop_confirmed_at: null,
      workshop_proof_set_digest: null,
      workshop_post_order_version: null,
    }],
  }],
  ['18 same person signs both roles', {
    ...baseInput(),
    baselines: [{
      ...baseInput().baselines[0],
      confirmed_by_workshop_profile_id: officeProfile,
    }],
  }],
  ['19 mismatched proof-set digests', {
    ...baseInput(),
    baselines: [{
      ...baseInput().baselines[0],
      workshop_proof_set_digest: 'b'.repeat(64),
    }],
  }],
  ['20 order advanced after old signatures', {
    ...baseInput(),
    transactionVersion: 12,
  }],
  ['21 M2 history missing', {...baseInput(), history: baseInput().history.slice(1)}],
  ['22 duplicate M2 history', {
    ...baseInput(),
    history: [...baseInput().history, baseInput().history[0]],
  }],
  ['23 post-order signature versions conflict', {
    ...baseInput(),
    baselines: [{
      ...baseInput().baselines[0],
      workshop_post_order_version: 9,
    }],
  }],
  ['24 baseline image version stale', {
    ...baseInput(),
    images: baseInput().images.map((image, index) =>
      index === 0 ? {...image, version_label: 'QA-R5'} : image),
  }],
  ['25 image from another organization', {
    ...baseInput(),
    images: baseInput().images.map((image, index) =>
      index === 0 ? {...image, organization_id: foreignOrg} : image),
  }],
  ['26 read scope unverified', {...baseInput(), readVerified: false}],
  ['27 malformed material payload', {
    ...baseInput(),
    resources: null as unknown as WosM4MaterialSignoffInput['resources'],
  }],
  ['28 cross-organization baseline', {
    ...baseInput(),
    baselines: [{...baseInput().baselines[0], organization_id: foreignOrg}],
  }],
  ['29 cross-organization profile', {
    ...baseInput(),
    profiles: baseInput().profiles.map(profile =>
      profile.id === officeProfile ? {...profile, org_id: foreignOrg} : profile),
  }],
  ['30 non-M2 history only', {
    ...baseInput(),
    history: baseInput().history.map(row => ({...row, reason_code: 'REVIEW_CORRECTION'})),
  }],
  ['31 M2 history wrong status transition', {
    ...baseInput(),
    history: baseInput().history.map((row, index) =>
      index === 1 ? {...row, previous_status: 'WORKSHOP_REVIEW'} : row),
  }],
  ['32 M2 history wrong baseline binding', {
    ...baseInput(),
    history: baseInput().history.map((row, index) =>
      index === 2
        ? {...row, metadata: {...row.metadata, baselineId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}}
        : row),
  }],
  ['33 M2 history wrong proof digest', {
    ...baseInput(),
    history: baseInput().history.map((row, index) =>
      index === 2 ? {...row, metadata: {...row.metadata, proofDigest: 'b'.repeat(64)}} : row),
  }],
  ['34 M2 history actor does not match signer', {
    ...baseInput(),
    history: baseInput().history.map((row, index) =>
      index === 1 ? {...row, actor_profile_id: workshopProfile} : row),
  }],
  ['35 resolved Office profile role incompatible', {
    ...baseInput(),
    profiles: baseInput().profiles.map(profile =>
      profile.id === officeProfile ? {...profile, role: 'operator'} : profile),
  }],
  ['36 duplicate request ID across M2 actions', {
    ...baseInput(),
    history: baseInput().history.map((row, index) =>
      index === 1
        ? {...row, metadata: {...row.metadata, requestId: baseInput().history[0].metadata?.requestId}}
        : row),
  }],
  ['37 M2 history action code mismatch', {
    ...baseInput(),
    history: baseInput().history.map((row, index) =>
      index === 2 ? {...row, metadata: {...row.metadata, action: 'BASELINE_SELECT'}} : row),
  }],
  ['38 visible signer profile inactive', {
    ...baseInput(),
    profiles: baseInput().profiles.map(profile =>
      profile.id === workshopProfile ? {...profile, is_active: false} : profile),
  }],
  ['39 arbitrary non-canonical private path', {
    ...baseInput(),
    images: baseInput().images.map((image, index) =>
      index === 0 ? {...image, storage_path: 'not-a-canonical-private-path'} : image),
  }],
  ['40 cross-order canonical path', {
    ...baseInput(),
    images: baseInput().images.map((image, index) =>
      index === 0 ? {
        ...image,
        storage_path: buildWosQaImageObjectPath({
          organizationId: org,
          orderId: '11111111-1111-4111-8111-111111111111',
          versionLabel: 'QA-R6',
          imageId: image.id,
          category: 'CUSTOMER_APPROVED_SAMPLE',
        }),
      } : image),
  }],
  ['41 wrong-category canonical path', {
    ...baseInput(),
    images: baseInput().images.map((image, index) =>
      index === 0 ? {
        ...image,
        storage_path: buildWosQaImageObjectPath({
          organizationId: org,
          orderId,
          versionLabel: 'QA-R6',
          imageId: image.id,
          category: 'FILM_PATTERN',
        }),
      } : image),
  }],
  ['42 wrong-version canonical path', {
    ...baseInput(),
    images: baseInput().images.map((image, index) =>
      index === 0 ? {
        ...image,
        storage_path: buildWosQaImageObjectPath({
          organizationId: org,
          orderId,
          versionLabel: 'QA-R5',
          imageId: image.id,
          category: 'CUSTOMER_APPROVED_SAMPLE',
        }),
      } : image),
  }],
  ['43 traversal path', {
    ...baseInput(),
    images: baseInput().images.map((image, index) =>
      index === 0 ? {
        ...image,
        storage_path: image.storage_path + '/../foreign',
      } : image),
  }],
  ['44 newer READY superseder invalidates selected image', {
    ...baseInput(),
    images: [...baseInput().images, {
      ...fifthProductImage,
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      supersedes_image_id: imageIds[0],
      file_name: 'replacement-customer-sample.png',
      storage_path: buildWosQaImageObjectPath({
        organizationId: org,
        orderId,
        versionLabel: 'QA-R6',
        imageId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        category: 'PRODUCT',
      }),
    }],
  }],
];

for (const [label, input] of failures) {
  const result = evaluateWosM4MaterialSignoff(input);
  assert.equal(result.currentBaseline.historicalM2EvidenceComplete, false, label);
  assert.equal(result.reviewReady, false, label);
  assert.equal(result.canStart, false, label);
}

// Generic wos_confirmations are not part of this input at all. The historical
// proof-set evidence above remains complete while wos_confirmations is empty.
assert.equal(base.currentBaseline.historicalM2EvidenceComplete, true);

const staleSelected = evaluateWosM4MaterialSignoff({
  ...baseInput(),
  images: baseInput().images.map((image, index) =>
    index === 0 ? {...image, version_label: 'QA-R5'} : image),
});
assert.equal(staleSelected.images[0]?.selectedInCurrentBaseline, true);
assert.equal(staleSelected.images[0]?.currentReady, false);

const workbench = readFileSync(
  'src/components/workshop-orders/MaterialSignoffWorkbench.tsx', 'utf8');
const ordinaryInbox = readFileSync(
  'src/components/workshop-orders/PersistedWorkshopInbox.tsx', 'utf8');
const apiServer = readFileSync('src/lib/workshop-orders/api-server.ts', 'utf8');
assert(workbench.includes('canStart=false'));
assert(workbench.includes('当前私有 proof 复核：不可验证'));
assert(workbench.includes('wos_qa_verified_image_proofs'));
assert(!/fetch\s*\(|\.rpc\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(workbench));
assert(ordinaryInbox.includes('<MaterialSignoffWorkbench'));
assert(!ordinaryInbox.includes('LiveQaWorkshopReadiness'));
assert(!ordinaryInbox.includes('LiveQaM2WorkshopConfirm'));
assert(!ordinaryInbox.includes('LiveQaFinalReadiness'));
assert(apiServer.includes("from('wos_visual_baseline_items')"));
assert(apiServer.includes("from('profiles')"));
assert(!apiServer.includes("from('wos_qa_verified_image_proofs')"));
assert(!apiServer.includes("from('wos_qa_p2_m2_receipts')"));
assert(!apiServer.includes('service_role'));

console.log('workshop-order-m4-material-signoff.test.ts: PASS');
console.log('WOS_M4_MATERIAL_SIGNOFF_NEGATIVE_CASES=' + failures.length);
console.log('WOS_M4_PRIVATE_PROOF_READ_STATE=AUTHENTICATED_RLS_UNAVAILABLE_FAIL_CLOSED');
console.log('WOS_M4_CAN_START_FALSE=PASS');
