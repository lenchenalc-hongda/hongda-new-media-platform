'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { NormalizedProductionOrderDraft } from '@/lib/workshop-orders/office-entry';
import {
  WOS_V1_IMAGE_CATEGORIES,
  WOS_V1_IMAGE_CATEGORY_SLUGS,
} from '@/lib/workshop-orders/production-app-contract';
import {
  fetchWosV1,
  isWosV1VerifiedOperation,
  uploadAndVerifyWosV1Image,
} from '@/lib/workshop-orders/production-app-client';

type WosV1ImageCategory = (typeof WOS_V1_IMAGE_CATEGORIES)[number];
const categoryLabels: Record<WosV1ImageCategory, string> = {
  PRODUCT: '产品图片',
  FILM_PATTERN: '花膜图案',
  CUSTOMER_APPROVED_SAMPLE: '客户确认样',
  SIGNED_SAMPLE: '大货签样',
};

function draftMatchesOrder(
  row: Record<string, unknown>,
  draft: NormalizedProductionOrderDraft,
): boolean {
  const nullable = (value: unknown) =>
    value === undefined || value === null || value === '' ? null : value;
  return row.order_number === draft.orderNumber
    && row.customer_name_snapshot === draft.customerName
    && nullable(row.project_name_snapshot) === nullable(draft.projectName)
    && row.product_name === draft.productName
    && row.priority === draft.priority
    && row.is_urgent === draft.isUrgent
    && row.requested_quantity === draft.requestedQuantity
    && row.current_batch_quantity === draft.currentBatchQuantity
    && nullable(row.planned_ship_date) === nullable(draft.plannedShipDate)
    && row.split_delivery === draft.splitDelivery
    && row.product_material === draft.productMaterial
    && nullable(row.surface_treatment) === nullable(draft.surfaceTreatment)
    && nullable(row.pattern_scope) === nullable(draft.patternScope)
    && nullable(row.seam_tolerance) === nullable(draft.seamTolerance)
    && nullable(row.position_reference) === nullable(draft.positionReference)
    && nullable(row.customer_acceptance_standard)
      === nullable(draft.customerAcceptanceStandard)
    && nullable(row.packaging_method) === nullable(draft.packagingMethod)
    && nullable(row.carton_quantity) === nullable(draft.cartonQuantity)
    && nullable(row.label_marking_rule) === nullable(draft.labelMarkingRule);
}

export default function ProductionOfficeWorkflow({
  draft,
  valid,
  writeEnabled,
}: {
  readonly draft: NormalizedProductionOrderDraft;
  readonly valid: boolean;
  readonly writeEnabled: boolean;
}) {
  const [files, setFiles] = useState<
    Partial<Record<WosV1ImageCategory, File>>
  >({});
  const [note, setNote] = useState(
    'Office confirms the four current production images and the submitted production requirements.',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState('');
  const requestRef = useRef<{
    createRequestId: string;
    submitRequestId: string;
    orderId: string;
    imageIds: Partial<Record<WosV1ImageCategory, string>>;
  }>({
    createRequestId: crypto.randomUUID(),
    submitRequestId: crypto.randomUUID(),
    orderId: '',
    imageIds: {},
  });
  const existingImageIdsRef = useRef<
    Partial<Record<WosV1ImageCategory, string>>
  >({});

  function selectFile(
    category: WosV1ImageCategory,
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.target.files?.[0];
    setFiles(current => ({ ...current, [category]: file }));
    setMessage('');
  }

  async function submit(): Promise<void> {
    if (busy) return;
    setMessage('');
    const priority = draft.priority;
    const requestedQuantity = draft.requestedQuantity;
    const currentBatchQuantity = draft.currentBatchQuantity;
    if (!valid || !priority || !requestedQuantity || !currentBatchQuantity) {
      setMessage('请先完成生产订单必填资料检查。');
      return;
    }
    if (draft.versionLabel !== 'V1') {
      setMessage('第一期正式创建固定为 V1；版本号不能在此步骤静默改写。');
      return;
    }
    if (draft.splitDelivery || draft.followUpBatchPlan) {
      setMessage('第一期数据库不支持保存后续批次计划；请关闭分批交付后再提交。');
      return;
    }
    if (note.trim().length < 10 || note.length > 2000) {
      setMessage('办公室齐套确认说明必须为 10 至 2000 字。');
      return;
    }
    if (WOS_V1_IMAGE_CATEGORIES.some(category =>
      files[category]?.type !== 'image/png')) {
      setMessage('当前可信验证仅接受四类 PNG 图片。');
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error('DATABASE_UNAVAILABLE');
      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user?.id) throw new Error('UNAUTHENTICATED');
      const profile = await supabase.from('profiles')
        .select('id,org_id,role,is_active')
        .eq('user_id', auth.data.user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (profile.error || !profile.data
        || !['admin', 'manager', 'sales'].includes(profile.data.role)
        || typeof profile.data.id !== 'string'
        || typeof profile.data.org_id !== 'string') {
        throw new Error('FORBIDDEN');
      }

      let orderId = requestRef.current.orderId || createdOrderId;
      if (!orderId) {
        setMessage('正在核对是否已有同一订单号的数据库 DRAFT。');
        const existing = await fetchWosV1({
          method: 'GET',
          query: '?view=office&orderNumber=' + encodeURIComponent(draft.orderNumber),
        });
        if (!existing.ok || existing.code !== 'OK') {
          throw new Error('DRAFT_RECOVERY_UNAVAILABLE');
        }
        const existingData = existing.data
          && typeof existing.data === 'object'
          ? existing.data as Record<string, unknown>
          : null;
        const matching = Array.isArray(existingData?.items)
          ? existingData.items.filter(value => {
              const row = value && typeof value === 'object'
                ? value as Record<string, unknown>
                : null;
              return row?.workflow_status === 'DRAFT'
                && row.version === 1
                && row.version_label === 'V1'
                && draftMatchesOrder(row, draft);
            }) as Record<string, unknown>[]
          : [];
        const existingItems = Array.isArray(existingData?.items)
          ? existingData.items as unknown[]
          : [];
        if (existingItems.length > 0 && matching.length !== 1) {
          throw new Error('DRAFT_PAYLOAD_MISMATCH');
        }
        const recovered = matching[0];
        if (typeof recovered?.id === 'string') {
          orderId = recovered.id;
          requestRef.current.orderId = orderId;
          setCreatedOrderId(orderId);
          setMessage('已恢复此前已提交但响应中断的同一张 DRAFT 订单。');
          const recoveredDetail = await fetchWosV1({
            method: 'GET',
            query: '?view=office&orderId=' + encodeURIComponent(orderId),
          });
          const detailData = recoveredDetail.data
            && typeof recoveredDetail.data === 'object'
            ? recoveredDetail.data as Record<string, unknown>
            : null;
          const detail = detailData?.detail && typeof detailData.detail === 'object'
            ? detailData.detail as Record<string, unknown>
            : null;
          if (!recoveredDetail.ok || recoveredDetail.code !== 'OK'
            || !detail || !Array.isArray(detail.images)) {
            throw new Error('DRAFT_IMAGE_RECOVERY_UNAVAILABLE');
          }
          const seen = new Set<string>();
          for (const value of detail.images) {
            const image = value && typeof value === 'object'
              ? value as Record<string, unknown>
              : null;
            const category = image?.category;
            const id = image?.id;
            if (typeof category !== 'string' || typeof id !== 'string'
              || !(WOS_V1_IMAGE_CATEGORIES as readonly string[]).includes(category)
              || seen.has(category)
              || image?.image_status !== 'READY'
              || image?.version_label !== 'V1') {
              throw new Error('DRAFT_IMAGE_SET_CONFLICT');
            }
            seen.add(category);
            existingImageIdsRef.current[category as WosV1ImageCategory] = id;
          }
        }
      }
      if (!orderId) {
        setMessage('正在创建数据库 DRAFT 订单。');
        const created = await fetchWosV1({
          method: 'POST',
          body: {
            operation: 'CREATE_ORDER',
            requestId: requestRef.current.createRequestId,
            payload: {
              orderNumber: draft.orderNumber,
              customerNameSnapshot: draft.customerName,
              projectNameSnapshot: draft.projectName || undefined,
              productName: draft.productName,
              priority,
              isUrgent: draft.isUrgent,
              requestedQuantity,
              currentBatchQuantity,
              plannedShipDate: draft.plannedShipDate ?? undefined,
              splitDelivery: draft.splitDelivery,
              productMaterial: draft.productMaterial,
              surfaceTreatment: draft.surfaceTreatment ?? undefined,
              patternScope: draft.patternScope ?? undefined,
              seamTolerance: draft.seamTolerance ?? undefined,
              positionReference: draft.positionReference ?? undefined,
              customerAcceptanceStandard:
                draft.customerAcceptanceStandard ?? undefined,
              packagingMethod: draft.packagingMethod ?? undefined,
              cartonQuantity: draft.cartonQuantity ?? undefined,
              labelMarkingRule: draft.labelMarkingRule ?? undefined,
            },
          },
        });
        if (!isWosV1VerifiedOperation(created, 'CREATE_ORDER')) {
          throw new Error(created.code);
        }
        const result = created.data as {
          result?: { orderId?: string; versionLabel?: string };
        };
        orderId = result.result?.orderId ?? '';
        if (!orderId || result.result?.versionLabel !== 'V1') {
          throw new Error('CREATE_RESULT_UNVERIFIED');
        }
        requestRef.current.orderId = orderId;
        setCreatedOrderId(orderId);
      }

      for (const category of WOS_V1_IMAGE_CATEGORIES) {
        const file = files[category];
        if (!file) throw new Error('FOUR_CURRENT_IMAGES_REQUIRED');
        const imageId = existingImageIdsRef.current[category]
          ?? requestRef.current.imageIds[category]
          ?? crypto.randomUUID();
        requestRef.current.imageIds[category] = imageId;
        setMessage(`正在验证 ${categoryLabels[category]} 的私有原始字节与 SHA-256。`);
        const verified = await uploadAndVerifyWosV1Image({
          client: supabase,
          organizationId: profile.data.org_id,
          orderId,
          versionLabel: 'V1',
          imageId,
          category,
          file,
        });
        if (!verified.ok) throw new Error(verified.code);
      }

      setMessage('正在提交办公室四图齐套确认。');
      const confirmed = await fetchWosV1({
        method: 'POST',
        body: {
          operation: 'CONFIRM_OFFICE',
          orderId,
          expectedVersion: 1,
          expectedLabel: 'V1',
          note,
        },
      });
      if (!isWosV1VerifiedOperation(confirmed, 'CONFIRM_OFFICE')) {
        throw new Error(confirmed.code);
      }

      setMessage('正在执行原子提交并等待持久 Inbox 回执。');
      const submitted = await fetchWosV1({
        method: 'POST',
        body: {
          operation: 'SUBMIT_ORDER',
          orderId,
          expectedVersion: 1,
          expectedLabel: 'V1',
          requestId: requestRef.current.submitRequestId,
        },
      });
      if (!isWosV1VerifiedOperation(submitted, 'SUBMIT_ORDER')) {
        throw new Error(submitted.code);
      }
      setMessage('数据库已确认提交，车间 Inbox 已生成。旧图片或旧版本不会显示为当前有效。');
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'UNKNOWN';
      setMessage(
        '事务未确认：' + code
        + '。不要修改本次订单内容；原样重试会复用已保留的请求 ID。',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4"
      aria-label="正式订单创建、图片验证与提交">
      <div>
        <h2 className="text-sm font-semibold text-emerald-950">正式订单图片与原子提交</h2>
        <p className="mt-1 text-xs leading-5 text-emerald-900">
          图片由独立 Edge 服务验证真实 PNG 字节、SHA-256 和 Storage 对象版本；
          只有数据库 Proof 成功后才能登记当前版本图片。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {WOS_V1_IMAGE_CATEGORIES.map(category => (
          <label key={category} className="rounded-md border border-emerald-200 bg-white p-3 text-xs font-medium text-gray-800">
            {categoryLabels[category]}
            <span className="ml-1 text-gray-500">
              ({WOS_V1_IMAGE_CATEGORY_SLUGS[category]})
            </span>
            <input
              type="file"
              accept="image/png"
              disabled={busy || !writeEnabled}
              onChange={event => selectFile(category, event)}
              className="mt-2 block w-full text-xs"
            />
          </label>
        ))}
      </div>
      <label className="block text-xs font-medium text-gray-800">
        办公室齐套确认说明
        <textarea
          rows={3}
          value={note}
          maxLength={2000}
          disabled={busy || !writeEnabled}
          onChange={event => { setNote(event.target.value); setMessage(''); }}
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm disabled:bg-gray-100"
        />
      </label>
      <button
        type="button"
        onClick={() => { void submit(); }}
        disabled={busy || !writeEnabled}
        className="min-h-11 rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? '验证并提交数据库中...' : '创建、验证四图并正式提交'}
      </button>
      {!writeEnabled && (
        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          正式写入开关关闭。当前不执行数据库写入或私有图片验证。
        </p>
      )}
      {message && <p role="status" className="break-words text-xs text-emerald-950">{message}</p>}
      {createdOrderId && (
        <p className="break-all text-xs text-emerald-900">订单 ID：{createdOrderId}</p>
      )}
      <p className="text-xs text-red-800">
        canStart=false。提交后进入车间接单和资料退回流程，不会自动开工。
      </p>
    </section>
  );
}
