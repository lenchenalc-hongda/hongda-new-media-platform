'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  parseWosP2M2Action,
  type WosP2M2Action,
} from '@/lib/workshop-orders/p2-m2-contract';
import {
  WOS_QA_IMAGE_CATEGORIES,
  WOS_QA_IMAGE_CATEGORY_LABELS,
  buildWosQaImageObjectPath,
  type WosQaImageCategory,
} from '@/lib/workshop-orders/qa-image-categories';
import {
  qaFileSha256,
  verifyQaImageSignature,
} from '@/lib/workshop-orders/qa-recovery';

type Order = {
  id: string;
  order_number: string;
  version: number;
  version_label: string;
  workflow_status: string;
};
type Image = {
  id: string;
  category: WosQaImageCategory;
  version_label: string;
  image_status: string;
};
type Baseline = {
  id: string;
  status: string;
  version_label: string;
  office_proof_set_digest: string | null;
  office_post_order_version: number | null;
  workshop_proof_set_digest: string | null;
  workshop_post_order_version: number | null;
};

export default function LiveQaM2OfficeBaseline() {
  const enabled = process.env.NEXT_PUBLIC_WOS_P2_QA_M2_ENABLED === 'true';
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeId, setActiveId] = useState('');
  const [images, setImages] = useState<Image[]>([]);
  const [files, setFiles] = useState<Partial<Record<WosQaImageCategory, File>>>({});
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [note, setNote] = useState('本地合成 QA 四类图片基准与办公室独立签认核对');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setMessage('');
    try {
      const db = createClient();
      if (!db) throw new Error('QA_SUPABASE_NOT_CONFIGURED');
      const auth = await db.auth.getUser();
      if (auth.error || !auth.data.user?.id) throw new Error('QA_LOGIN_REQUIRED');
      const profile = await db.from('profiles')
        .select('id,org_id,role,is_active').eq('user_id', auth.data.user.id)
        .eq('is_active', true).maybeSingle();
      if (profile.error || !profile.data) throw new Error('QA_PROFILE_UNAVAILABLE');
      const orderResult = await db.from('wos_production_orders')
        .select('id,order_number,version,version_label,workflow_status')
        .eq('organization_id', profile.data.org_id)
        .in('workflow_status', ['WAITING_MATERIAL', 'READINESS_CHECK'])
        .like('order_number', 'QA-NONPROD-%')
        .order('updated_at', { ascending: false }).limit(20);
      if (orderResult.error) throw new Error('QA_M2_ORDERS_UNAVAILABLE');
      const rows = (orderResult.data ?? []) as Order[];
      setOrders(rows);
      const selected = rows.find(row => row.id === activeId) ?? rows[0];
      setActiveId(selected?.id ?? '');
      if (!selected) {
        setImages([]);
        setBaseline(null);
        return;
      }
      const [imageResult, baselineResult] = await Promise.all([
        db.from('wos_reference_images')
          .select('id,category,version_label,image_status')
          .eq('organization_id', profile.data.org_id)
          .eq('entity_type', 'PRODUCTION_ORDER').eq('entity_id', selected.id)
          .eq('version_label', selected.version_label).eq('image_status', 'READY')
          .is('superseded_at', null).limit(20),
        db.from('wos_visual_baselines')
          .select('id,status,version_label,office_proof_set_digest,office_post_order_version,workshop_proof_set_digest,workshop_post_order_version')
          .eq('organization_id', profile.data.org_id)
          .eq('entity_type', 'PRODUCTION_ORDER').eq('entity_id', selected.id)
          .eq('version_label', selected.version_label)
          .in('status', ['DRAFT', 'CURRENT'])
          .is('superseded_at', null).maybeSingle(),
      ]);
      if (imageResult.error || baselineResult.error) throw new Error('QA_M2_EVIDENCE_UNAVAILABLE');
      setImages((imageResult.data ?? []) as Image[]);
      setBaseline((baselineResult.data as Baseline | null) ?? null);
    } catch {
      setOrders([]);
      setImages([]);
      setBaseline(null);
      setMessage('QA_M2_OFFICE_READ_FAILED');
    } finally {
      setLoading(false);
    }
  }, [activeId, enabled]);

  useEffect(() => { void load(); }, [load]);

  async function submit(action: 'BASELINE_SELECT' | 'BASELINE_OFFICE_CONFIRM') {
    if (!enabled || loading) return;
    const order = orders.find(row => row.id === activeId);
    if (!order) return;
    const payload = action === 'BASELINE_SELECT'
      ? {
          productionVersionLabel: order.version_label,
          note: note.trim(),
          imageIds: images.map(image => image.id),
        }
      : {
          productionVersionLabel: order.version_label,
          note: note.trim(),
          baselineId: baseline?.id ?? '',
        };
    const intent = {
      orderId: order.id,
      expectedVersion: order.version,
      action,
      payload,
    };
    const fingerprint = JSON.stringify(intent);
    const requestId = pending.current?.fingerprint === fingerprint
      ? pending.current.requestId : crypto.randomUUID();
    const request = parseWosP2M2Action({ ...intent, requestId });
    if (!request) {
      setMessage('QA_M2_INPUT_INVALID');
      return;
    }
    pending.current = { fingerprint, requestId };
    setLoading(true);
    setMessage('正在提交 M2 受控事务...');
    try {
      const response = await fetch('/api/workshop-orders/p2/m2', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'x-wos-p2-m2': '1',
          Accept: 'application/json',
        },
        body: JSON.stringify(request satisfies WosP2M2Action),
      });
      const result: {
        ok?: boolean;
        code?: string;
        data?: { requestId?: string; version?: number; canStart?: boolean };
      } = await response.json();
      if (!response.ok || !result.ok
        || !['QA_P2_M2_ACTION_APPLIED', 'QA_P2_M2_REPLAY_VERIFIED'].includes(result.code ?? '')
        || result.data?.requestId !== requestId
        || result.data?.version !== order.version + 1
        || result.data?.canStart !== false) {
        setMessage('QA_M2_NOT_VERIFIED:' + (result.code ?? 'UNKNOWN'));
        return;
      }
      pending.current = null;
      setMessage(action === 'BASELINE_SELECT'
        ? '四类图片基准已由服务端证明摘要锁定。'
        : '办公室已独立签认同一 proof-set digest；仍需车间不同账号签认。');
      await load();
    } catch {
      setMessage('QA_M2_NETWORK_RESULT_UNVERIFIED');
    } finally {
      setLoading(false);
    }
  }

  async function uploadRevisionImages() {
    if (!enabled || loading) return;
    const order = orders.find(row => row.id === activeId);
    if (!order || !/^QA-R[1-9][0-9]*$/.test(order.version_label)) return;
    if (WOS_QA_IMAGE_CATEGORIES.some(category => {
      const candidate = files[category];
      return !candidate || candidate.type !== 'image/png';
    })) {
      setMessage('QA_REVISION_FOUR_PNG_REQUIRED');
      return;
    }
    setLoading(true);
    setMessage('正在上传并验证修订版四类图片...');
    try {
      const db = createClient();
      if (!db) throw new Error('QA_SUPABASE_NOT_CONFIGURED');
      const auth = await db.auth.getUser();
      if (auth.error || !auth.data.user?.id) throw new Error('QA_LOGIN_REQUIRED');
      const profile = await db.from('profiles')
        .select('id,org_id,role,is_active').eq('user_id', auth.data.user.id)
        .eq('is_active', true).maybeSingle();
      if (profile.error || !profile.data) throw new Error('QA_PROFILE_UNAVAILABLE');
      for (const category of WOS_QA_IMAGE_CATEGORIES) {
        const candidate = files[category]!;
        if (!await verifyQaImageSignature(candidate)) throw new Error('QA_REVISION_PNG_INVALID');
        const imageId = crypto.randomUUID();
        const fileSha256 = await qaFileSha256(candidate);
        const objectPath = buildWosQaImageObjectPath({
          organizationId: profile.data.org_id,
          orderId: order.id,
          versionLabel: order.version_label,
          imageId,
          category,
        });
        const bucket = db.storage.from('wos-private');
        const existing = await bucket.download(objectPath);
        if (existing.data) throw new Error('QA_REVISION_IMAGE_PATH_COLLISION');
        const upload = await bucket.upload(objectPath, candidate, {
          contentType: candidate.type,
          cacheControl: '0',
          upsert: false,
        });
        if (upload.error) throw new Error('QA_REVISION_IMAGE_UPLOAD_FAILED');
        const verified = await fetch('/api/workshop-orders/qa-image-verify', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            imageId,
            category,
            storagePath: objectPath,
            sha256: fileSha256,
          }),
        });
        const proof: unknown = await verified.json().catch(() => null);
        if (!verified.ok || !proof || typeof proof !== 'object'
          || !('code' in proof) || proof.code !== 'QA_IMAGE_VERIFIED') {
          throw new Error('QA_REVISION_IMAGE_PROOF_FAILED');
        }
        const registration = await db.rpc('wos_register_qa_revision_image', {
          p_order_id: order.id,
          p_image_id: imageId,
          p_category: category,
          p_storage_path: objectPath,
        });
        if (registration.error || !['CREATED', 'REPLAYED'].includes(registration.data?.status)) {
          throw new Error('QA_REVISION_IMAGE_REGISTRATION_FAILED');
        }
      }
      setFiles({});
      setMessage('修订版四类图片已通过私有对象证明并登记。');
      await load();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setMessage(code.startsWith('QA_') ? code : 'QA_REVISION_IMAGE_FLOW_FAILED');
    } finally {
      setLoading(false);
    }
  }

  if (!enabled) return null;
  const categories = new Set(images.map(image => image.category));
  const completeImages = WOS_QA_IMAGE_CATEGORIES.every(category => categories.has(category));
  const canUploadRevision = !completeImages
    && (
      process.env.NEXT_PUBLIC_WOS_ALLOW_LOCAL_SUPABASE === 'true'
      || process.env.NEXT_PUBLIC_WOS_QA_REVISION_IMAGES_ENABLED === 'true'
    )
    && /^QA-R[1-9][0-9]*$/.test(orders.find(row => row.id === activeId)?.version_label ?? '');
  const officeSigned = !!baseline?.office_proof_set_digest;
  const workshopSigned = !!baseline?.workshop_proof_set_digest;

  return (
    <section aria-label="QA 四类图片基准与办公室签认"
      className="mb-6 space-y-3 rounded-lg border border-indigo-300 bg-indigo-50 p-4">
      <header>
        <h2 className="text-sm font-semibold text-indigo-950">四类图片基准与办公室独立签认</h2>
        <p className="mt-1 text-xs text-indigo-900">
          所有摘要由数据库根据当前订单规格、私有对象和 SHA-256 证明生成；浏览器只选择当前版本图片。
          签认不会放行开工。
        </p>
      </header>
      <label className="block text-xs font-medium text-indigo-950">
        当前可核对订单
        <select value={activeId} disabled={loading || !orders.length}
          onChange={event => { setActiveId(event.target.value); pending.current = null; }}
          className="mt-1 w-full rounded border border-indigo-300 bg-white p-2">
          {!orders.length && <option value="">没有等待物料核对的 QA 订单</option>}
          {orders.map(order => (
            <option key={order.id} value={order.id}>
              {order.order_number} · {order.workflow_status} · v{order.version}
            </option>
          ))}
        </select>
      </label>
      {activeId && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {WOS_QA_IMAGE_CATEGORIES.map(category => (
              <p key={category} className="rounded border border-indigo-200 bg-white p-2 text-xs">
                {WOS_QA_IMAGE_CATEGORY_LABELS[category]} · {categories.has(category) ? '已登记' : '缺失'}
              </p>
            ))}
          </div>
          {canUploadRevision && (
            <fieldset className="space-y-2 rounded border border-indigo-200 bg-white p-2">
              <legend className="px-1 text-xs font-medium text-indigo-950">
                上传当前修订版四类图片（仅本地显式开关）
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {WOS_QA_IMAGE_CATEGORIES.map(category => (
                  <label key={category} className="block text-xs">
                    {WOS_QA_IMAGE_CATEGORY_LABELS[category]}
                    <input type="file" accept="image/png" disabled={loading}
                      aria-label={'修订版 QA 图片 · ' + category}
                      onChange={event => {
                        const file = event.target.files?.[0];
                        setFiles(current => ({ ...current, [category]: file }));
                      }}
                      className="mt-1 block w-full" />
                  </label>
                ))}
              </div>
              <button type="button" disabled={loading} onClick={() => void uploadRevisionImages()}
                className="rounded bg-indigo-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
                上传并登记修订版四类图片
              </button>
            </fieldset>
          )}
          <label className="block text-xs font-medium text-indigo-950">
            签认依据（10–500 字）
            <textarea value={note} rows={2} disabled={loading} maxLength={500}
              onChange={event => { setNote(event.target.value); pending.current = null; }}
              className="mt-1 w-full rounded border border-indigo-300 bg-white p-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={loading || !completeImages} onClick={() => void submit('BASELINE_SELECT')}
              className="rounded bg-indigo-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
              锁定四类图片为当前基准
            </button>
            <button type="button" disabled={loading || !baseline || officeSigned}
              onClick={() => void submit('BASELINE_OFFICE_CONFIRM')}
              className="rounded bg-emerald-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
              办公室签认当前 proof-set
            </button>
            <button type="button" disabled={loading} onClick={() => void load()}
              className="rounded border border-indigo-400 bg-white px-3 py-2 text-xs">
              刷新证据状态
            </button>
          </div>
          <p className="text-xs text-indigo-950">
            基准：{baseline?.id ?? '未建立'} · Office：{officeSigned ? '已签认' : '未签认'} ·
            Workshop：{workshopSigned ? '已签认' : '未签认'} · canStart=false
          </p>
        </>
      )}
      {message && <p role="status" className="rounded bg-white p-2 text-xs text-indigo-950">{message}</p>}
      {loading && <p role="status" className="text-xs text-indigo-950">正在读取或提交真实事务...</p>}
    </section>
  );
}
