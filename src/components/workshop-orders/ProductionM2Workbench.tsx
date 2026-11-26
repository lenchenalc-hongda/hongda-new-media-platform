'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchWosV1M2 } from '@/lib/workshop-orders/production-m2-client';
import {
  isWosP2M2Result,
  isWosV1StartReleaseResult,
  type WosP2M2Action,
  type WosV1StartRelease,
} from '@/lib/workshop-orders/p2-m2-contract';

export interface ProductionM2Order {
  readonly id: string;
  readonly version: number;
  readonly version_label: string;
  readonly workflow_status: string;
  readonly current_batch_quantity: number;
}

export interface ProductionM2Detail {
  readonly images: readonly {
    readonly id: string;
    readonly category: string;
    readonly image_status: string;
    readonly version_label: string;
  }[];
  readonly resources: readonly {
    readonly resource_type: string;
    readonly status: string;
    readonly version_label: string | null;
    readonly quantity_expected: number | null;
    readonly quantity_arrived: number | null;
    readonly arrived_at: string | null;
    readonly confirmed_at: string | null;
  }[];
  readonly baselines: readonly {
    readonly id: string;
    readonly version_label: string;
    readonly status: string;
    readonly confirmed_by_office_profile_id?: string | null;
    readonly confirmed_by_workshop_profile_id?: string | null;
    readonly office_confirmed_at?: string | null;
    readonly workshop_confirmed_at?: string | null;
  }[];
}

const REQUIRED_CATEGORIES = [
  'PRODUCT',
  'FILM_PATTERN',
  'CUSTOMER_APPROVED_SAMPLE',
  'SIGNED_SAMPLE',
] as const;
const RESOURCE_STATUS: Record<string, readonly string[]> = {
  FILM: ['NOT_ARRIVED', 'PARTIALLY_ARRIVED', 'ARRIVED'],
  FIXTURE: ['NOT_AVAILABLE', 'IN_PRODUCTION', 'ARRIVED'],
  INCOMING_MATERIAL: ['NOT_ARRIVED', 'PARTIALLY_ARRIVED', 'ARRIVED'],
  SIGNED_SAMPLE: ['MISSING', 'UPLOADED', 'PHYSICAL_SAMPLE_RECEIVED'],
};

function uuid(): string {
  return crypto.randomUUID();
}

function localDateTime(): string {
  const now = new Date();
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

export default function ProductionM2Workbench({
  surface,
  order,
  detail,
  writeEnabled,
  onSuccess,
}: {
  readonly surface: 'office' | 'workshop';
  readonly order: ProductionM2Order;
  readonly detail: ProductionM2Detail;
  readonly writeEnabled: boolean;
  readonly onSuccess: () => void;
}) {
  const [role, setRole] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(
    detail.baselines.find(value =>
      value.status === 'CURRENT'
      && value.version_label === order.version_label)?.id
      ?? detail.baselines.find(value =>
        value.status === 'DRAFT'
        && value.version_label === order.version_label)?.id
      ?? null,
  );
  const [materialType, setMaterialType] = useState('FILM');
  const [materialStatus, setMaterialStatus] = useState('ARRIVED');
  const [materialArrivedAt, setMaterialArrivedAt] = useState(localDateTime);
  const [quantityExpected, setQuantityExpected] = useState(
    String(order.current_batch_quantity),
  );
  const [quantityArrived, setQuantityArrived] = useState(
    String(order.current_batch_quantity),
  );
  const [filmArrivedAt, setFilmArrivedAt] = useState(localDateTime);
  const [fixtureArrivedAt, setFixtureArrivedAt] = useState(localDateTime);
  const [incomingArrivedAt, setIncomingArrivedAt] = useState(localDateTime);
  const [signedSampleArrivedAt, setSignedSampleArrivedAt] = useState(localDateTime);
  const requestIds = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;
    const client = createClient();
    if (!client) return () => { active = false; };
    void client.auth.getUser().then(async auth => {
      if (!active || auth.error || !auth.data.user?.id) return;
      const profile = await client.from('profiles')
        .select('id,role,is_active')
        .eq('user_id', auth.data.user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (active && !profile.error && profile.data?.is_active === true) {
        setRole(profile.data.role);
        setProfileId(profile.data.id);
      }
    });
    return () => { active = false; };
  }, []);

  const currentVersionImages = detail.images.filter(image =>
    image.image_status === 'READY'
    && image.version_label === order.version_label);
  const officeRoleAllowed = role !== null
    && ['admin', 'manager', 'sales'].includes(role);
  const workshopRoleAllowed = role !== null
    && ['admin', 'manager', 'operator'].includes(role);
  const m2Editable = order.workflow_status === 'WAITING_MATERIAL';
  const selectedImages = REQUIRED_CATEGORIES.map(category =>
    currentVersionImages.find(image => image.category === category));
  const completeImageSet = selectedImages.every(Boolean);
  const currentBaseline = detail.baselines.find(value =>
    value.status === 'CURRENT'
    && value.version_label === order.version_label)
    ?? detail.baselines.find(value => value.id === selectedBaselineId)
    ?? null;
  const currentResources = detail.resources.filter(resource =>
    resource.version_label === order.version_label);
  const registeredResourceTypes = new Set(currentResources
    .filter(resource =>
      (RESOURCE_STATUS[resource.resource_type] ?? []).includes(resource.status)
      || resource.confirmed_at !== null)
    .map(resource => resource.resource_type));
  const finalResourceTypes = new Set(currentResources
    .filter(resource =>
      resource.confirmed_at !== null
      && (
        (resource.resource_type === 'FILM'
          && resource.status === 'VERSION_VERIFIED')
        || (resource.resource_type === 'FIXTURE'
          && resource.status === 'FIT_VERIFIED')
        || (resource.resource_type === 'INCOMING_MATERIAL'
          && resource.status === 'QUANTITY_VERIFIED')
        || (resource.resource_type === 'SIGNED_SAMPLE'
          && resource.status === 'VERIFIED')
      ))
    .map(resource => resource.resource_type));
  const officeSigned = Boolean(
    currentBaseline?.confirmed_by_office_profile_id
    && currentBaseline.office_confirmed_at,
  );
  const workshopSigned = Boolean(
    currentBaseline?.confirmed_by_workshop_profile_id
    && currentBaseline.workshop_confirmed_at,
  );
  const independentReleaseActor = Boolean(
    profileId
    && profileId !== currentBaseline?.confirmed_by_office_profile_id
    && profileId !== currentBaseline?.confirmed_by_workshop_profile_id,
  );
  const finalReadinessActor = Boolean(
    profileId
    && profileId !== currentBaseline?.confirmed_by_office_profile_id,
  );
  const materialArrivalIso = toIso(materialArrivedAt);
  const filmArrivedIso = toIso(filmArrivedAt);
  const fixtureArrivedIso = toIso(fixtureArrivedAt);
  const incomingArrivedIso = toIso(incomingArrivedAt);
  const signedSampleArrivedIso = toIso(signedSampleArrivedAt);
  const finalDatesReady = Boolean(
    filmArrivedIso
    && fixtureArrivedIso
    && incomingArrivedIso
    && signedSampleArrivedIso,
  );

  function requestIdFor(fingerprint: string): string {
    const value = requestIds.current.get(fingerprint) ?? uuid();
    requestIds.current.set(fingerprint, value);
    return value;
  }

  function baseAction(
    action: WosP2M2Action['action'],
    payload: Record<string, unknown>,
  ): WosP2M2Action {
    const fingerprint = JSON.stringify({
      action,
      orderId: order.id,
      version: order.version,
      payload,
    });
    return {
      action,
      orderId: order.id,
      expectedVersion: order.version,
      requestId: requestIdFor(fingerprint),
      payload: {
        productionVersionLabel: order.version_label,
        note: note.trim(),
        ...payload,
      },
    } as WosP2M2Action;
  }

  async function submitM2(action: WosP2M2Action): Promise<void> {
    if (busy || !writeEnabled || note.trim().length < 10) return;
    setBusy(true);
    setMessage('等待数据库事务、Proof 有效期和双签规则核验。');
    try {
      const result = await fetchWosV1M2(action);
      if (!result.ok
        || !isWosP2M2Result(result.data, action)
        || !['WOS_V1_M2_ACTION_APPLIED', 'WOS_V1_M2_REPLAY_VERIFIED']
          .includes(result.code)) {
        setMessage('事务未确认：' + result.code + '。相同内容重试会复用请求 ID。');
        return;
      }
      const response = result.data as Record<string, unknown>;
      if (typeof response.baselineId === 'string') {
        setSelectedBaselineId(response.baselineId);
      }
      setNote('');
      setMessage(action.action === 'FINAL_READINESS_CONFIRM'
        ? '四类物料已完成同一事务确认，订单进入 READINESS_CHECK。'
        : '当前版本事务已确认。');
      onSuccess();
    } catch {
      setMessage('网络结果未知。相同内容重试会复用请求 ID。');
    } finally {
      setBusy(false);
    }
  }

  async function submitStartRelease(): Promise<void> {
    if (busy || !writeEnabled || note.trim().length < 10
      || !currentBaseline) return;
    const payload = {
      baselineId: currentBaseline.id,
      note: note.trim(),
    };
    const fingerprint = JSON.stringify({
      action: 'START_RELEASE',
      orderId: order.id,
      version: order.version,
      payload,
    });
    const action: WosV1StartRelease = {
      action: 'START_RELEASE',
      orderId: order.id,
      expectedVersion: order.version,
      requestId: requestIdFor(fingerprint),
      payload,
    };
    setBusy(true);
    setMessage('等待独立人工放行事务核验。');
    try {
      const result = await fetchWosV1M2(action);
      if (!result.ok
        || !isWosV1StartReleaseResult(result.data, action)
        || !['WOS_V1_START_RELEASE_AUTHORIZED',
          'WOS_V1_START_RELEASE_REPLAY_VERIFIED'].includes(result.code)) {
        setMessage('人工放行未确认：' + result.code);
        return;
      }
      setNote('');
      setMessage('已完成人工生产放行；系统未自动开工，仍保持 productionStarted=false。');
      onSuccess();
    } catch {
      setMessage('网络结果未知。相同内容重试会复用请求 ID。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-3 space-y-3 border-t border-slate-300 pt-3">
      <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <p className="border-l-2 border-slate-300 pl-2">
          Office 签认：{officeSigned ? '已完成' : '未完成'}
        </p>
        <p className="border-l-2 border-slate-300 pl-2">
          Workshop 签认：{workshopSigned ? '已完成' : '未完成'}
        </p>
        <p className="border-l-2 border-slate-300 pl-2">
          已登记物料：{registeredResourceTypes.size} / 4
        </p>
        <p className="border-l-2 border-slate-300 pl-2">
          最终齐套：{finalResourceTypes.size} / 4
        </p>
      </div>

      {surface === 'office' && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-900">
            办公室选择当前版本四图 Baseline
          </p>
          <p className="text-xs text-slate-700">
            当前 READY 分类：{selectedImages.map((image, index) =>
              image ? image.category : REQUIRED_CATEGORIES[index]).join('、')}
          </p>
          <button
            type="button"
            disabled={busy || !writeEnabled || !m2Editable || !officeRoleAllowed
              || !completeImageSet
              || note.trim().length < 10}
            onClick={() => {
              if (!completeImageSet) return;
              void submitM2(baseAction('BASELINE_SELECT', {
                imageIds: selectedImages.map(image => image?.id),
              }));
            }}
            className="min-h-11 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            选择当前版本四图 Baseline
          </button>
          <button
            type="button"
            disabled={busy || !writeEnabled || !m2Editable || !officeRoleAllowed
              || !selectedBaselineId
              || note.trim().length < 10}
            onClick={() => {
              if (!selectedBaselineId) return;
              void submitM2(baseAction('BASELINE_OFFICE_CONFIRM', {
                baselineId: selectedBaselineId,
              }));
            }}
            className="min-h-11 rounded-md border border-slate-500 bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-40"
          >
            办公室签认所选 Baseline
          </button>
        </div>
      )}

      {surface === 'workshop' && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-800">
              物料类型
              <select
                value={materialType}
                disabled={busy || !writeEnabled || !m2Editable
                  || !workshopRoleAllowed}
                onChange={event => {
                  const next = event.target.value;
                  setMaterialType(next);
                  setMaterialStatus(RESOURCE_STATUS[next]?.[0] ?? '');
                }}
                className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
              >
                {Object.keys(RESOURCE_STATUS).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-800">
              缺口状态
              <select
                value={materialStatus}
                disabled={busy || !writeEnabled || !m2Editable
                  || !workshopRoleAllowed}
                onChange={event => setMaterialStatus(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
              >
                {(RESOURCE_STATUS[materialType] ?? []).map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-800">
              到料时间
              <input
                type="datetime-local"
                value={materialArrivedAt}
                disabled={busy || !writeEnabled || !m2Editable
                  || !workshopRoleAllowed}
                onChange={event => setMaterialArrivedAt(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
              />
            </label>
            {materialType === 'INCOMING_MATERIAL' && (
              <>
                <label className="text-xs font-medium text-slate-800">
                  应到数量
                  <input
                    type="number"
                    min={0}
                    value={quantityExpected}
                    disabled={busy || !writeEnabled || !m2Editable
                      || !workshopRoleAllowed}
                    onChange={event => setQuantityExpected(event.target.value)}
                    className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-slate-800">
                  实到数量
                  <input
                    type="number"
                    min={0}
                    value={quantityArrived}
                    disabled={busy || !writeEnabled || !m2Editable
                      || !workshopRoleAllowed}
                    onChange={event => setQuantityArrived(event.target.value)}
                    className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
                  />
                </label>
              </>
            )}
          </div>
          <button
            type="button"
            disabled={busy || !writeEnabled || !m2Editable
              || !workshopRoleAllowed
              || (!materialStatus.startsWith('NOT_')
                && materialStatus !== 'MISSING'
                && materialStatus !== 'IN_PRODUCTION'
                && materialStatus !== 'UPLOADED'
                && !materialArrivalIso)
              || note.trim().length < 10}
            onClick={() => {
              const pending = materialStatus.startsWith('NOT_')
                || materialStatus === 'MISSING'
                || materialStatus === 'IN_PRODUCTION'
                || materialStatus === 'UPLOADED';
              void submitM2(baseAction('MATERIAL_RECORD', {
                resourceType: materialType,
                resourceStatus: materialStatus,
                arrivedAt: pending ? null : materialArrivalIso,
                quantityExpected: materialType === 'INCOMING_MATERIAL'
                  ? Number(quantityExpected) : null,
                quantityArrived: materialType === 'INCOMING_MATERIAL'
                  ? Number(quantityArrived) : null,
                physicalCheckAttested: materialType === 'FIXTURE'
                  ? materialStatus === 'FIT_VERIFIED'
                  : true,
              }));
            }}
            className="min-h-11 rounded-md border border-slate-500 bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-40"
          >
            登记物料状态与缺口
          </button>

          <button
            type="button"
            disabled={busy || !writeEnabled || !m2Editable
              || !workshopRoleAllowed
              || !currentBaseline
              || !officeSigned || note.trim().length < 10}
            onClick={() => {
              if (!currentBaseline) return;
              void submitM2(baseAction('BASELINE_WORKSHOP_CONFIRM', {
                baselineId: currentBaseline.id,
              }));
            }}
            className="min-h-11 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            车间独立签认同一 Baseline
          </button>

          <section className="space-y-2 border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold text-slate-900">
              最终四类物料确认
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['FILM', filmArrivedAt, setFilmArrivedAt],
                ['FIXTURE', fixtureArrivedAt, setFixtureArrivedAt],
                ['INCOMING_MATERIAL', incomingArrivedAt, setIncomingArrivedAt],
                ['SIGNED_SAMPLE', signedSampleArrivedAt, setSignedSampleArrivedAt],
              ].map(([label, value, setter]) => (
                <label key={String(label)} className="text-xs font-medium text-slate-800">
                  {String(label)} 到料时间
                  <input
                    type="datetime-local"
                    value={String(value)}
                    disabled={busy || !writeEnabled || !m2Editable
                      || !workshopRoleAllowed}
                    onChange={event =>
                      (setter as (next: string) => void)(event.target.value)}
                    className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
                  />
                </label>
              ))}
              <label className="text-xs font-medium text-slate-800">
                本批应到数量
                <input
                  type="number"
                  min={1}
                  value={quantityExpected}
                  disabled={busy || !writeEnabled || !m2Editable
                    || !workshopRoleAllowed}
                  onChange={event => setQuantityExpected(event.target.value)}
                  className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-800">
                本批实到数量
                <input
                  type="number"
                  min={1}
                  value={quantityArrived}
                  disabled={busy || !writeEnabled || !m2Editable
                    || !workshopRoleAllowed}
                  onChange={event => setQuantityArrived(event.target.value)}
                  className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy || !writeEnabled || !m2Editable
                || !workshopRoleAllowed || !finalDatesReady
                || !currentBaseline
                || !officeSigned || !workshopSigned || !finalReadinessActor
                || note.trim().length < 10}
              onClick={() => {
                if (!currentBaseline) return;
                void submitM2(baseAction('FINAL_READINESS_CONFIRM', {
                  baselineId: currentBaseline.id,
                  physicalCheckAttested: true,
                  filmArrivedAt: filmArrivedIso,
                  fixtureArrivedAt: fixtureArrivedIso,
                  incomingArrivedAt: incomingArrivedIso,
                  signedSampleArrivedAt: signedSampleArrivedIso,
                  quantityExpected: Number(quantityExpected),
                  quantityArrived: Number(quantityArrived),
                }));
              }}
              className="min-h-11 rounded-md bg-emerald-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              原子确认四类物料并进入 READINESS_CHECK
            </button>
          </section>
        </div>
      )}

      {(role === 'admin' || role === 'manager')
        && order.workflow_status === 'READINESS_CHECK'
        && currentBaseline && (
        <section className="space-y-2 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-900">独立人工生产放行</p>
          <button
            type="button"
            disabled={busy || !writeEnabled || !independentReleaseActor
              || note.trim().length < 10}
            onClick={() => { void submitStartRelease(); }}
            className="min-h-11 rounded-md border border-emerald-800 bg-white px-3 py-2 text-xs font-semibold text-emerald-950 disabled:opacity-40"
          >
            人工放行至 READY_TO_START
          </button>
          <p className="text-xs text-slate-700">
            放行要求 Office、Workshop 和放行人是三个不同 Profile，且当前 Proof、物料与 Baseline 全部有效；系统不会自动开工。
          </p>
        </section>
      )}

      <label className="block text-xs font-medium text-slate-800">
        当前操作说明（10 至 500 字）
        <textarea
          rows={2}
          maxLength={500}
          value={note}
          disabled={busy || !writeEnabled}
          onChange={event => { setNote(event.target.value); setMessage(''); }}
          className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm disabled:bg-slate-100"
        />
      </label>
      {message && <p role="status" className="text-xs text-slate-800">{message}</p>}
      <p className="text-xs font-medium text-red-800">
        canStart=false；所有签认与最终齐套均不自动开工。
      </p>
    </section>
  );
}
