'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { NormalizedProductionOrderDraft } from '@/lib/workshop-orders/office-entry';
import { clearQaRecovery, qaFileSha256, readQaRecovery, saveQaRecovery, verifyQaImageSignature, type QaRecovery, type QaRecoveryStage } from '@/lib/workshop-orders/qa-recovery';

type Stage = QaRecoveryStage;
type Progress = QaRecovery;
interface Props {
  draft: NormalizedProductionOrderDraft;
  valid: boolean;
  onFillQaSample: (orderNumber?: string) => void;
}
const qaUrl = 'https://xulmpqaknlwqqculbsek.supabase.co';
const maxBytes = 20 * 1024 * 1024;
const mimeExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function newProgress(userId: string, orgId: string, orderNumber: string, versionLabel: string): Progress {
  return {
    schema: 1,
    createdAt: Date.now(),
    userId, orgId, orderNumber, versionLabel,
    orderId: null,
    imageId: null,
    objectPath: null,
    fileSha256: null,
    idempotencyKey: crypto.randomUUID(),
    stage: 'NEW',
  };
}

export default function LiveQaProductionSubmit({ draft, valid, onFillQaSample }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [officeAuthorized, setOfficeAuthorized] = useState<boolean | null>(null);
  const [note, setNote] = useState('QA nonproduction office readiness; test only, not released for workshop production.');
  const [busy, setBusy] = useState(false);
  const [stageLabel, setStageLabel] = useState('待提交');
  const [errorCode, setErrorCode] = useState('');
  const [done, setDone] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState('');
  const [recovered, setRecovered] = useState(false);
  const [authRefreshStatus, setAuthRefreshStatus] = useState('');
  const stateRef = useRef<Progress | null>(null);

  useEffect(() => {
    let active = true;
    const verifyOfficeRole = async () => {
      try {
        const client = createClient();
        if (!client) { if (active) setOfficeAuthorized(false); return; }
        const auth = await client.auth.getUser();
        if (auth.error || !auth.data.user?.id) {
          if (active) setOfficeAuthorized(false);
          return;
        }
        const { data, error } = await client.from('profiles')
          .select('role,is_active,org_id')
          .eq('user_id', auth.data.user.id)
          .maybeSingle();
        const allowed = !error && data?.is_active === true &&
          ['admin','manager','sales'].includes(data?.role ?? '');
        if (!active) return;
        setOfficeAuthorized(allowed);
        if (allowed && data?.org_id) {
          const previous = readQaRecovery(auth.data.user.id, data.org_id);
          if (previous && previous.stage !== 'SUBMITTED') {
            stateRef.current = previous;
            onFillQaSample(previous.orderNumber);
            setStageLabel('检测到上次未完成的 QA 订单，请核对后继续原请求');
            setRecovered(true);
          }
        }
      } catch { if (active) setOfficeAuthorized(false); }
    };
    void verifyOfficeRole();
    return () => { active = false; };
  // The sample restoration callback has no external side effects; it only
  // restores a synthetic order number into the local form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // QA-only control to exercise real Supabase refresh-token rotation without
  // exposing JWT, refresh token, cookie, or session contents to test logs.
  async function verifySessionRefresh() {
    if (busy || officeAuthorized !== true) return;
    setAuthRefreshStatus('QA_AUTH_REFRESH_RUNNING');
    try {
      const client = createClient();
      if (!client) throw new Error('QA_AUTH_CLIENT_UNAVAILABLE');
      const before = await client.auth.getUser();
      if (before.error || !before.data.user?.id) throw new Error('QA_AUTH_NOT_SIGNED_IN');
      const rotated = await client.auth.refreshSession();
      if (rotated.error || !rotated.data.session ||
          rotated.data.user?.id !== before.data.user.id)
        throw new Error('QA_AUTH_REFRESH_FAILED');
      const after = await client.auth.getUser();
      if (after.error || after.data.user?.id !== before.data.user.id)
        throw new Error('QA_AUTH_REFRESH_IDENTITY_MISMATCH');
      setAuthRefreshStatus('QA_AUTH_REFRESH_VERIFIED');
    } catch { setAuthRefreshStatus('QA_AUTH_REFRESH_FAILED'); }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (stateRef.current && !['NEW', 'DRAFT'].includes(stateRef.current.stage)) return;
    setFile(event.target.files?.[0] ?? null);
  }

  function guard(): string | null {
    if (officeAuthorized !== true) return 'QA_OFFICE_ROLE_NOT_ALLOWED';
    const allowedHost = typeof window !== 'undefined' && (
      window.location.hostname.endsWith('.vercel.app') ||
      (window.location.hostname === 'localhost' && process.env.NEXT_PUBLIC_WOS_QA_LOCAL_TEST === 'true')
    );
    if (!allowedHost || process.env.NEXT_PUBLIC_SUPABASE_URL !== qaUrl)
      return 'QA_ENVIRONMENT_NOT_PINNED';
    if (!valid || !draft.priority || !draft.requestedQuantity || !draft.currentBatchQuantity)
      return 'ORDER_FIELDS_INCOMPLETE';
    if (!draft.orderNumber.startsWith('QA-NONPROD-') ||
        draft.customerName !== 'QA NONPRODUCTION ONLY' ||
        !/^V[1-9][0-9]{0,20}$/.test(draft.versionLabel))
      return 'SYNTHETIC_QA_ORDER_REQUIRED';
    if ((!stateRef.current || ['NEW', 'DRAFT'].includes(stateRef.current.stage)) &&
        (!file || !mimeExtensions[file.type] || file.size < 12 || file.size > maxBytes))
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
    // Reject spoofed image bytes BEFORE creating any draft, to avoid
    // accumulating incomplete QA orders due to invalid uploads.
    if ((!stateRef.current || ['NEW','DRAFT'].includes(stateRef.current.stage)) &&
        file && !await verifyQaImageSignature(file)) {
      setErrorCode('QA_PRIVATE_IMAGE_MAGIC_BYTES_INVALID');
      return;
    }
    setBusy(true);
    const client = createClient();
    let state: Progress | null = stateRef.current;
    const save = (stage: Stage, label: string) => {
      if (!state) throw new Error('QA_RECOVERY_STATE_UNAVAILABLE');
      state.stage = stage;
      saveQaRecovery(state);
      setStageLabel(label);
    };
    try {
      if (!client) throw new Error('QA_SUPABASE_CLIENT_UNAVAILABLE');
      const auth = await client.auth.getUser();
      if (auth.error || !auth.data.user?.id) throw new Error('PLEASE_LOGIN_TO_QA_FIRST');
      const profile = await client.from('profiles')
        .select('id,org_id,role,is_active')
        .eq('user_id', auth.data.user!.id)
        .eq('is_active', true)
        .single();
      if (profile.error || !profile.data ||
          !['admin','manager','sales'].includes(profile.data.role))
        throw new Error('OFFICE_SUBMIT_ROLE_REQUIRED');
      const { id: profileId, org_id: orgId } = profile.data!;
      if (!state) {
        state = newProgress(auth.data.user!.id, orgId, draft.orderNumber, draft.versionLabel);
        stateRef.current = state;
        save('NEW', '已保留原始幂等键；正在核对数据库中是否已有此草稿');
      }
      if (state.userId !== auth.data.user!.id || state.orgId !== orgId ||
          state.orderNumber !== draft.orderNumber || state.versionLabel !== draft.versionLabel)
        throw new Error('QA_RECOVERY_ACTOR_OR_ORDER_CHANGED');

      // Do not trust tab memory as an authoritative order status. After an
      // interrupted POST/refresh, look up the exact synthetic order first.
      if (!state.orderId) {
        const lookup = await client.from('wos_production_orders')
          .select('id,version,workflow_status,version_label')
          .eq('organization_id', orgId)
          .eq('created_by_profile_id', profileId)
          .eq('order_number', state.orderNumber).maybeSingle();
        if (lookup.error) throw new Error('QA_RECOVERY_ORDER_LOOKUP_FAILED');
        if (lookup.data) {
          if (lookup.data.version_label !== state.versionLabel ||
              !['DRAFT', 'SUBMITTED'].includes(lookup.data.workflow_status))
            throw new Error('QA_RECOVERY_ORDER_CONFLICT');
          state.orderId = lookup.data.id;
          save('DRAFT', '已找到此前创建的同一张 QA 草稿，不再重复创建');
        }
      }

      if (state.orderId) {
        const canonical = await client.from('wos_production_orders')
          .select('id,workflow_status,version,version_label,organization_id,created_by_profile_id')
          .eq('id', state.orderId).eq('organization_id', orgId).maybeSingle();
        if (canonical.error || !canonical.data ||
            canonical.data.version_label !== state.versionLabel ||
            canonical.data.created_by_profile_id !== profileId)
          throw new Error('QA_RECOVERY_CANONICAL_ORDER_MISMATCH');
        if (canonical.data.workflow_status === 'SUBMITTED') {
          const receipt = await client.from('wos_submission_receipts')
            .select('id').eq('order_id', state.orderId)
            .eq('idempotency_key', state.idempotencyKey)
            .limit(1).maybeSingle();
          if (receipt.error || !receipt.data?.id)
            throw new Error('QA_ALREADY_SUBMITTED_WITH_DIFFERENT_REQUEST');
          save('SUBMITTED', '数据库确认原请求已提交；无需再写一次');
          setSuccessOrderId(state.orderId);
          setDone(true);
          clearQaRecovery(state.userId, state.orgId);
          return;
        }
        if (canonical.data.workflow_status !== 'DRAFT' || canonical.data.version !== 1)
          throw new Error('QA_RECOVERY_ORDER_NO_LONGER_EDITABLE');
      }

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
          throw new Error('QA_DRAFT_CREATION_NOT_VERIFIED');
        state.orderId = creation.data.id;
        save('DRAFT', '草稿已存入隔离库；准备上传私有图片');
      }

      if (state.stage === 'DRAFT') {
        // The MIME field and extension alone are not a file-type check.
        // Only synthetic PNG is supported by the strict QA server integrity
        // verifier. JPEG/WebP remain blocked pending full decoder review.
        if (!file || file.type!=='image/png' || !await verifyQaImageSignature(file))
          throw new Error('QA_PRIVATE_IMAGE_PNG_REQUIRED');
        const fileHash = await qaFileSha256(file);
        if (state.fileSha256 && state.fileSha256 !== fileHash)
          throw new Error('QA_RECOVERY_RESELECT_ORIGINAL_IMAGE');
        state.fileSha256 = fileHash;
        const imageId = state.imageId ?? crypto.randomUUID();
        state.imageId = imageId;
        const extension = mimeExtensions[file.type];
        const path = [
          'organizations', orgId, 'wos', 'production-order',
          state.orderId!, 'images', 'product', 'versions',
          draft.versionLabel, imageId, 'qa-preview-proof.' + extension,
        ].join('/');
        if (state.objectPath && state.objectPath !== path)
          throw new Error('QA_RECOVERY_IMAGE_PATH_CHANGED');
        state.objectPath = path;
        save('DRAFT', '已固定图片哈希和唯一对象路径；正在安全核对上传');
        const bucket = client.storage.from('wos-private');
        const previous = await bucket.download(path);
        if (previous.data) {
          if (await qaFileSha256(previous.data) !== fileHash)
            throw new Error('QA_PRIVATE_IMAGE_EXISTING_BINARY_MISMATCH');
        } else {
          const upload = await bucket.upload(path, file,
            { contentType: file.type, cacheControl: '0', upsert: false });
          if (upload.error) {
            // A lost upload response may mean the object was already stored.
            // Re-download and hash-compare before accepting any retry.
            const afterError = await bucket.download(path);
            if (!afterError.data || await qaFileSha256(afterError.data) !== fileHash)
              throw new Error('QA_PRIVATE_IMAGE_UPLOAD_UNVERIFIED');
          }
        }
        save('UPLOADED', '已校验私有对象真实字节和文件哈希；正在登记');
      }

      if (state.stage === 'UPLOADED') {
        // Read back exact bytes through a SAME-ORIGIN, authenticated server
        // endpoint before the normal UI path may call image-registration RPC.
        // This protects the normal QA flow from browser-only MIME spoofing.
        // Direct RPC bypass remains a separate Production safety gate.
        if (!state.orderId || !state.imageId || !state.objectPath || !state.fileSha256)
          throw new Error('QA_IMAGE_VERIFY_STATE_MISSING');
        const verified = await fetch('/api/workshop-orders/qa-image-verify', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: state.orderId, imageId: state.imageId,
            storagePath: state.objectPath, sha256: state.fileSha256,
          }),
        });
        const proof:unknown=await verified.json().catch(()=>null);
        if (!verified.ok || !proof || typeof proof!=='object'
          || !('code' in proof) || proof.code!=='QA_IMAGE_VERIFIED'
          || !('data' in proof) || !proof.data || typeof proof.data!=='object'
          || !('sha256' in proof.data) || proof.data.sha256!==state.fileSha256)
          throw new Error('QA_IMAGE_SERVER_BINARY_VERIFY_FAILED');
        const registeredImage = async () => {
          const result = await client.from('wos_reference_images')
            .select('id,storage_path,image_status').eq('id', state!.imageId!)
            .eq('entity_id', state!.orderId!).maybeSingle();
          if (result.error) throw new Error('QA_IMAGE_REGISTRY_READ_UNAVAILABLE');
          if (!result.data) return false;
          if (result.data.storage_path !== state!.objectPath || result.data.image_status !== 'READY')
            throw new Error('QA_RECOVERY_IMAGE_REGISTRY_MISMATCH');
          return true;
        };
        if (!await registeredImage()) {
          const registration = await client.rpc('wos_register_uploaded_reference_image', {
            p_order_id: state.orderId!,
            p_image_id: state.imageId!,
            p_category: 'PRODUCT',
            p_storage_path: state.objectPath!,
          });
          if (registration.error || !['CREATED', 'REPLAYED'].includes(registration.data?.status)) {
            // Retry reads are safe; the registration may have committed before
            // the HTTP response was lost. Never register a different path.
            if (!await registeredImage())
              throw new Error('QA_PRIVATE_IMAGE_SERVER_REGISTRATION_FAILED');
          }
        }
        save('REGISTERED', '已确认图片登记在原订单上；正在核对办公室齐套');
      }

      if (state.stage === 'REGISTERED') {
        const hasReadiness = async () => {
          const r = await client.from('wos_office_readiness_receipts')
            .select('id').eq('order_id', state!.orderId!)
            .eq('source_revision', 1).eq('source_version_label', draft.versionLabel)
            .limit(1).maybeSingle();
          if (r.error) throw new Error('QA_READINESS_RECEIPT_LOOKUP_FAILED');
          return !!r.data?.id;
        };
        if (!await hasReadiness()) {
          const readiness = await client.rpc('wos_confirm_office_completeness', {
            p_order_id: state.orderId!,
            p_expected_revision: 1,
            p_expected_label: draft.versionLabel,
            p_note: note.trim(),
          });
          if ((readiness.error || !readiness.data) && !await hasReadiness())
            throw new Error('QA_OFFICE_READINESS_FAILED');
        }
        save('READY', '办公室资料齐套已验证；正在通过同源 HTTP API 提交');
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
          throw new Error('QA_HTTP_SUBMISSION_' + (message || 'UNVERIFIED'));
        if (!body || typeof body !== 'object' || !('data' in body)
          || !body.data || typeof body.data !== 'object'
          || !('orderId' in body.data) || body.data.orderId !== state.orderId)
          throw new Error('QA_HTTP_RECEIPT_MISMATCH');
        save('SUBMITTED', '真实 HTTP 提交成功；车间账号可刷新 Inbox');
        setSuccessOrderId(state.orderId!);
        setDone(true);
        clearQaRecovery(state.userId, state.orgId);
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

  if (officeAuthorized !== true) {
    return (
      <section role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
        {officeAuthorized === null
          ? '正在核对非生产账号是否拥有办公室下单权限...'
          : '当前测试账号没有办公室下单权限；仅 Admin、Manager 和 Sales 可以显示 QA 提交按钮。'}
      </section>
    );
  }

  return (
    <section aria-label="隔离数据库真实下单验收" className="space-y-3 rounded-lg border-2 border-blue-300 bg-blue-50 p-4">
      <div>
        <h2 className="text-sm font-semibold text-blue-950">QA Preview · 真实 HTTP 提交验收</h2>
        <p className="mt-1 text-xs leading-5 text-blue-800">
          仅在独立测试数据库开放，生成真正的测试草稿、私有图片和提交回执。
          不创建正式客户订单，不执行生产开工。只在本设备浏览器保存限时 24 小时的合成订单标识与幂等键（按 QA 用户和组织隔离），关闭并重新打开浏览器后可核对恢复；不保存密码、Token 或图片内容。
        </p>
      </div>
      <button type="button" disabled={busy || !!stateRef.current?.orderId}
        onClick={() => onFillQaSample()}
        className="rounded-md border border-blue-400 bg-white px-3 py-2 text-xs font-medium text-blue-950 disabled:opacity-40">
        自动填入全套合成 QA 测试资料
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { void verifySessionRefresh(); }}
          disabled={busy || authRefreshStatus === 'QA_AUTH_REFRESH_RUNNING'}
          className="rounded-md border border-blue-400 bg-white px-3 py-2 text-xs font-medium text-blue-950 disabled:opacity-40">
          QA 强制刷新登录会话
        </button>
        {authRefreshStatus && <span role="status" className="text-xs text-blue-950">{authRefreshStatus}</span>}
      </div>
      <label className="block text-xs font-medium text-blue-950">
        对应版本的产品基准图片（必选，PNG / JPEG / WEBP，不超过 20MB）
        <input aria-label="QA 私有图片" className="mt-1 block w-full text-xs" type="file"
          accept="image/png,image/jpeg,image/webp" disabled={busy || !!stateRef.current && !['NEW','DRAFT'].includes(stateRef.current.stage)}
          onChange={selectFile} />
      </label>
      <label className="block text-xs font-medium text-blue-950">
        办公室齐套确认备注
        <textarea aria-label="QA 资料确认备注" className="mt-1 w-full rounded-md border border-blue-200 px-2 py-2"
          value={note} disabled={busy || !!stateRef.current?.orderId}
          onChange={event => setNote(event.target.value)} rows={2} />
      </label>
      <p role="status" className="text-xs font-medium text-blue-950">执行阶段：{stageLabel}</p>
      {recovered && <p className="text-xs font-semibold text-blue-900">
        检测到同一用户上次中断的合成订单。请选择原图片（如需要），先点击下方“检查资料完整性”，再继续同一请求；不会重新生成幂等键。
      </p>}
      {errorCode && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
        {errorCode}。请继续使用本页面恢复的同一订单/幂等键，切勿重新新建生产单。
      </p>}
      {stateRef.current?.orderId && <p className="break-all text-xs text-blue-900">
        QA Order ID：{stateRef.current.orderId}
      </p>}
      <button type="button" disabled={busy || done}
        onClick={() => { void submit(); }}
        className="min-h-11 rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? '提交中...' : done ? '已提交' : stateRef.current ? '使用同一订单和幂等键继续验证' : '上传图片并提交 QA 订单'}
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
