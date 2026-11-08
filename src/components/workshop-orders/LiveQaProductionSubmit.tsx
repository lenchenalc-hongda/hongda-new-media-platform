'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { NormalizedProductionOrderDraft } from '@/lib/workshop-orders/office-entry';

type Stage = 'NEW' | 'DRAFT' | 'UPLOADED' | 'REGISTERED' | 'READY' | 'SUBMITTED';
interface Progress {
  orderId: string | null;
  imageId: string | null;
  objectPath: string | null;
  idempotencyKey: string;
  stage: Stage;
}
interface Props {
  draft: NormalizedProductionOrderDraft;
  valid: boolean;
  onFillQaSample: () => void;
}
const qaUrl = 'https://xulmpqaknlwqqculbsek.supabase.co';
const maxBytes = 20 * 1024 * 1024;
const mimeExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function newProgress(): Progress {
  return {
    orderId: null,
    imageId: null,
    objectPath: null,
    idempotencyKey: crypto.randomUUID(),
    stage: 'NEW',
  };
}

export default function LiveQaProductionSubmit({ draft, valid, onFillQaSample }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('QA nonproduction office readiness; test only, not released for workshop production.');
  const [busy, setBusy] = useState(false);
  const [stageLabel, setStageLabel] = useState('待提交');
  const [errorCode, setErrorCode] = useState('');
  const [done, setDone] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState('');
  const stateRef = useRef<Progress | null>(null);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (stateRef.current?.orderId) return;
    setFile(event.target.files?.[0] ?? null);
  }

  function guard(): string | null {
    if (typeof window === 'undefined' ||
        !window.location.hostname.endsWith('.vercel.app') ||
        process.env.NEXT_PUBLIC_SUPABASE_URL !== qaUrl) return 'QA_ENVIRONMENT_NOT_PINNED';
    if (!valid || !draft.priority || !draft.requestedQuantity || !draft.currentBatchQuantity)
      return 'ORDER_FIELDS_INCOMPLETE';
    if (!draft.orderNumber.startsWith('QA-NONPROD-') ||
        draft.customerName !== 'QA NONPRODUCTION ONLY' ||
        !/^V[1-9][0-9]{0,20}$/.test(draft.versionLabel))
      return 'SYNTHETIC_QA_ORDER_REQUIRED';
    if (!file || !mimeExtensions[file.type] || file.size < 1 || file.size > maxBytes)
      return 'PRIVATE_IMAGE_REQUIRED_JPEG_PNG_WEBP_MAX_20MB';
    if (note.trim().length < 10 || note.length > 2000)
      return 'OFFICE_CONFIRMATION_NOTE_INVALID';
    return null;
  }

  async function submit() {
    if (busy || done) return;
    setErrorCode('');
    const denied = guard();
    if (denied) { setErrorCode(denied); return; }
    setBusy(true);
    const state = stateRef.current ?? newProgress();
    stateRef.current = state;
    const save = (stage: Stage, label: string) => {
      state.stage = stage;
      setStageLabel(label);
    };
    const reject = (code: string): never => { throw new Error(code); };
    const client = createClient();
    try {
      if (!client) reject('QA_SUPABASE_CLIENT_UNAVAILABLE');
      const auth = await client.auth.getUser();
      if (auth.error || !auth.data.user?.id) reject('PLEASE_LOGIN_TO_QA_FIRST');
      const profile = await client.from('profiles')
        .select('id,org_id,role,is_active')
        .eq('user_id', auth.data.user!.id)
        .eq('is_active', true)
        .single();
      if (profile.error || !profile.data ||
          !['admin','manager','sales'].includes(profile.data.role))
        reject('OFFICE_SUBMIT_ROLE_REQUIRED');
      const { id: profileId, org_id: orgId } = profile.data!;

      if (!state.orderId) {
        save('NEW', '正在创建真实非生产草稿...');
        const creation = await client.from('wos_production_orders').insert({
          organization_id: orgId,
          customer_name_snapshot: draft.customerName,
          project_name_snapshot: draft.projectName || null,
          order_number: draft.orderNumber,
          product_name: draft.productName,
          sales_owner_profile_id: profileId,
          project_owner_profile_id: profileId,
          created_by_profile_id: profileId,
          priority: draft.priority,
          is_urgent: draft.isUrgent,
          version_label: draft.versionLabel,
          requested_quantity: draft.requestedQuantity,
          current_batch_quantity: draft.currentBatchQuantity,
          planned_ship_date: draft.plannedShipDate,
          split_delivery: draft.splitDelivery,
          product_material: draft.productMaterial,
          surface_treatment: draft.surfaceTreatment,
          pattern_scope: draft.patternScope,
          seam_tolerance: draft.seamTolerance,
          position_reference: draft.positionReference,
          customer_acceptance_standard: draft.customerAcceptanceStandard,
          packaging_method: draft.packagingMethod,
          carton_quantity: draft.cartonQuantity,
          label_marking_rule: draft.labelMarkingRule,
        }).select('id,version,workflow_status').single();
        if (creation.error || !creation.data?.id ||
            creation.data.version !== 1 ||
            creation.data.workflow_status !== 'DRAFT')
          reject('QA_DRAFT_CREATION_NOT_VERIFIED');
        state.orderId = creation.data.id;
        save('DRAFT', '草稿已存入隔离库；准备上传私有图片');
      }

      if (state.stage === 'DRAFT') {
        const imageId = state.imageId ?? crypto.randomUUID();
        state.imageId = imageId;
        const extension = mimeExtensions[file!.type];
        const path = [
          'organizations', orgId, 'wos', 'production-order',
          state.orderId!, 'images', 'product', 'versions',
          draft.versionLabel, imageId, 'qa-preview-proof.' + extension,
        ].join('/');
        state.objectPath = path;
        const upload = await client.storage.from('wos-private').upload(
          path, file!, { contentType: file!.type, cacheControl: '0', upsert: false },
        );
        if (upload.error) reject('QA_PRIVATE_IMAGE_UPLOAD_FAILED');
        save('UPLOADED', '图片已上传到私有 Storage；正在登记校验');
      }

      if (state.stage === 'UPLOADED') {
        const registered = await client.rpc('wos_register_uploaded_reference_image', {
          p_order_id: state.orderId!,
          p_image_id: state.imageId!,
          p_category: 'PRODUCT',
          p_storage_path: state.objectPath!,
        });
        if (registered.error || registered.data?.status !== 'CREATED')
          reject('QA_PRIVATE_IMAGE_SERVER_REGISTRATION_FAILED');
        save('REGISTERED', '图片已通过服务器登记；正在确认办公室资料');
      }

      if (state.stage === 'REGISTERED') {
        const readiness = await client.rpc('wos_confirm_office_completeness', {
          p_order_id: state.orderId!,
          p_expected_revision: 1,
          p_expected_label: draft.versionLabel,
          p_note: note.trim(),
        });
        if (readiness.error || !readiness.data)
          reject('QA_OFFICE_READINESS_FAILED');
        save('READY', '资料齐套已确认；正在通过同源 HTTP API 提交');
      }

      if (state.stage === 'READY') {
        const res = await fetch('/api/workshop-orders/production', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: state.idempotencyKey,
            expectedVersion: 1,
            payload: { orderId: state.orderId, versionLabel: draft.versionLabel },
          }),
        });
        const body: unknown = await res.json().catch(() => null);
        const message = body && typeof body === 'object'
          && 'code' in body && typeof body.code === 'string' ? body.code : '';
        if (!res.ok || message !== 'SUBMISSION_VERIFIED'
          && message !== 'SUBMISSION_REPLAY_VERIFIED')
          reject('QA_HTTP_SUBMISSION_' + (message || 'UNVERIFIED'));
        if (!body || typeof body !== 'object' || !('data' in body)
          || !body.data || typeof body.data !== 'object'
          || !('orderId' in body.data) || body.data.orderId !== state.orderId)
          reject('QA_HTTP_RECEIPT_MISMATCH');
        save('SUBMITTED', '真实 HTTP 提交成功；车间账号可刷新 Inbox');
        setSuccessOrderId(state.orderId!);
        setDone(true);
      }
    } catch (err) {
      // Show only our fixed allowlisted error codes. Never expose raw server
      // responses, JWTs, email addresses, SQL text or image paths.
      const code = err instanceof Error ? err.message : '';
      setErrorCode(/^QA_[A-Z0-9_]+$/.test(code) || code === 'PLEASE_LOGIN_TO_QA_FIRST'
        || code === 'OFFICE_SUBMIT_ROLE_REQUIRED'
        ? code : 'QA_UNVERIFIED_UNEXPECTED_ERROR');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="隔离数据库真实下单验收" className="space-y-3 rounded-lg border-2 border-blue-300 bg-blue-50 p-4">
      <div>
        <h2 className="text-sm font-semibold text-blue-950">QA Preview · 真实 HTTP 提交验收</h2>
        <p className="mt-1 text-xs leading-5 text-blue-800">
          仅在独立测试数据库开放，生成真正的测试草稿、私有图片和提交回执。
          不创建正式客户订单，不执行生产开工。刷新后不会保留未完成步骤，请勿用于真实业务。
        </p>
      </div>
      <button type="button" disabled={busy || !!stateRef.current?.orderId}
        onClick={onFillQaSample}
        className="rounded-md border border-blue-400 bg-white px-3 py-2 text-xs font-medium text-blue-950 disabled:opacity-40">
        自动填入全套合成 QA 测试资料
      </button>
      <label className="block text-xs font-medium text-blue-950">
        对应版本的产品基准图片（必选，PNG / JPEG / WEBP，不超过 20MB）
        <input aria-label="QA 私有图片" className="mt-1 block w-full text-xs" type="file"
          accept="image/png,image/jpeg,image/webp" disabled={busy || !!stateRef.current?.orderId}
          onChange={selectFile} />
      </label>
      <label className="block text-xs font-medium text-blue-950">
        办公室齐套确认备注
        <textarea aria-label="QA 资料确认备注" className="mt-1 w-full rounded-md border border-blue-200 px-2 py-2"
          value={note} disabled={busy || !!stateRef.current?.orderId}
          onChange={event => setNote(event.target.value)} rows={2} />
      </label>
      <p role="status" className="text-xs font-medium text-blue-950">执行阶段：{stageLabel}</p>
      {errorCode && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
        {errorCode}。本次不创建新的幂等键；如状态未知，请先在车间 Inbox 核对。
      </p>}
      {stateRef.current?.orderId && <p className="break-all text-xs text-blue-900">
        QA Order ID：{stateRef.current.orderId}
      </p>}
      <button type="button" disabled={busy || done}
        onClick={() => { void submit(); }}
        className="min-h-11 rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? '提交中...' : done ? '已提交' : stateRef.current?.orderId ? '使用同一请求继续验证' : '上传图片并提交 QA 订单'}
      </button>
      {done && <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
        <p className="font-semibold">已由真实 HTTP API 提交（生产尚未开工）。</p>
        <p className="mt-1 break-all">订单：{successOrderId}</p>
        <Link href="/workshop-orders/inbox" className="mt-2 inline-block font-semibold underline">
          切换至车间 Operator 账号，刷新并核对车间 Inbox
        </Link>
      </div>}
    </section>
  );
}
