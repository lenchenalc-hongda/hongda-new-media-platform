'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CustomerRatingBadge, CustomerRatingLegend } from './CustomerRatingBadge';
import type { CustomerRatingGrade } from './customer-rating-colors';
import {
  calculatePotentialRating,
  POTENTIAL_RATING_DIMENSIONS,
  POTENTIAL_RATING_WEIGHTS,
  type PotentialRatingField,
  type PotentialRatingGrade,
  type PotentialRatingScores,
  type PotentialRatingStatus,
} from '@/lib/customer-projects/customer-potential-rating';

type RatingSummary = {
  customerReferenceId: string;
  actualGrade: CustomerRatingGrade;
  actualExplanation: string;
  potentialGrade: PotentialRatingGrade;
  potentialStatus: PotentialRatingStatus | 'ungraded';
  potentialScore: number | null;
  pendingScore: number | null;
  maintenanceOwnerName: string | null;
  canAssess: boolean;
  nextAction: string | null;
  nextCheckOn: string | null;
  strategy: { label: string; action: string };
};

type RatingDetail = {
  scores: PotentialRatingScores;
  assessmentScore: number;
  assessmentGrade: PotentialRatingGrade;
  evidenceSummary: string;
  status: PotentialRatingStatus;
  publishedGrade: PotentialRatingGrade | null;
  publishedScore: number | null;
  publishedAt: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  version: number;
  updatedAt: string;
};

type CustomerWorkspace = {
  customerNote: string;
  noteVersion: number;
  noteUpdatedAt: string | null;
  opportunitySummary: string;
  estimatedAnnualOpportunityCnyYuan: number | null;
  nextAction: string;
  nextCheckOn: string | null;
  planVersion: number;
  planUpdatedAt: string | null;
};

type RatingResponse = {
  summaries: RatingSummary[];
  detail: RatingDetail | null;
  workspace: CustomerWorkspace | null;
  canReview: boolean;
};

const emptyScores = (): PotentialRatingScores => ({
  purchase_scope: -1,
  process_fit: -1,
  project_evidence: -1,
  decision_access: -1,
  repeat_value: -1,
});

const STATUS_LABEL: Record<PotentialRatingStatus | 'ungraded', string> = {
  ungraded: '尚未初评',
  draft: '草稿',
  pending_review: '待管理者审核',
  approved: '已批准',
  changes_requested: '退回补充',
};

export default function CustomerRatingPanel({
  customerReferenceId,
}: {
  customerReferenceId: string;
}) {
  const [data, setData] = useState<RatingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [scores, setScores] = useState<PotentialRatingScores>(emptyScores);
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [opportunitySummary, setOpportunitySummary] = useState('');
  const [estimatedAnnualCny, setEstimatedAnnualCny] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextCheckOn, setNextCheckOn] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [ratingExpanded, setRatingExpanded] = useState(false);
  const [customerNote, setCustomerNote] = useState('');
  const [savingRating, setSavingRating] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [ratingMessage, setRatingMessage] = useState('');
  const [ratingError, setRatingError] = useState('');
  const [noteMessage, setNoteMessage] = useState('');
  const [noteError, setNoteError] = useState('');
  const [planMessage, setPlanMessage] = useState('');
  const [planError, setPlanError] = useState('');

  const load = useCallback(async (resetRating: boolean, resetWorkspace: boolean) => {
    try {
      const response = await fetch(
        '/api/customer-projects/customer-ratings?customerId=' + encodeURIComponent(customerReferenceId),
        { cache: 'no-store' },
      );
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message ?? '客户评级数据暂不可用');
      }
      const info = json.data as RatingResponse;
      setData(info);
      setLoadError('');
      if (resetRating) {
        const detail = info.detail;
        setScores(detail?.scores ?? emptyScores());
        setEvidenceSummary(detail?.evidenceSummary ?? '');
        setReviewNote('');
      }
      if (resetWorkspace) {
        setCustomerNote(info.workspace?.customerNote ?? '');
        setOpportunitySummary(info.workspace?.opportunitySummary ?? '');
        setEstimatedAnnualCny(info.workspace?.estimatedAnnualOpportunityCnyYuan == null
          ? '' : String(info.workspace.estimatedAnnualOpportunityCnyYuan));
        setNextAction(info.workspace?.nextAction ?? '');
        setNextCheckOn(info.workspace?.nextCheckOn ?? '');
      }
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : '评级读取失败');
    } finally {
      setLoading(false);
    }
  }, [customerReferenceId]);

  useEffect(() => {
    setLoading(true);
    void load(true, true);
  }, [load]);

  const summary = data?.summaries[0] ?? null;
  const scoresComplete = POTENTIAL_RATING_DIMENSIONS.every(({ key }) =>
    Number.isInteger(scores[key]) && scores[key] >= 0 && scores[key] <= 5,
  );
  const preview = useMemo(
    () => scoresComplete ? calculatePotentialRating(scores) : null,
    [scores, scoresComplete],
  );

  async function saveRating(submit: boolean) {
    if (savingRating || !summary?.canAssess) return;
    if (!preview) {
      setRatingError('请先完成五项潜力评分（每项0–5分）');
      return;
    }
    if (submit && evidenceSummary.trim().length < 20) {
      setRatingError('提交审核需填写至少20字客户事实依据');
      return;
    }
    setSavingRating(true);
    setRatingError('');
    setRatingMessage('');
    try {
      const response = await fetch('/api/customer-projects/customer-ratings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerReferenceId,
          scores,
          evidenceSummary,
          submit,
          expectedVersion: data?.detail?.version ?? null,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.message || '潜力评分保存失败');
      await load(true, false);
      setRatingExpanded(false);
      setRatingMessage(submit
        ? '评分已提交管理者审核，正式等级仍以审核结果为准。'
        : '潜力评分草稿已保存，编辑区已收起。');
    } catch (cause) {
      setRatingError(cause instanceof Error ? cause.message : '潜力评分保存失败');
    } finally {
      setSavingRating(false);
    }
  }

  async function review(decision: 'approve' | 'request_changes') {
    if (savingRating || !data?.canReview || !data.detail) return;
    if (decision === 'request_changes' && reviewNote.trim().length < 5) {
      setRatingError('退回需要填写至少5个字的原因');
      return;
    }
    setSavingRating(true);
    setRatingError('');
    setRatingMessage('');
    try {
      const response = await fetch('/api/customer-projects/customer-ratings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerReferenceId,
          expectedVersion: data.detail.version,
          decision,
          reviewNote,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.message || '审核失败');
      await load(true, false);
      setRatingExpanded(false);
      setRatingMessage(decision === 'approve'
        ? '评级已审核通过，正式等级已更新。'
        : '已退回补充，评分编辑区已收起。');
    } catch (cause) {
      setRatingError(cause instanceof Error ? cause.message : '审核失败');
    } finally {
      setSavingRating(false);
    }
  }

  async function saveCustomerNote() {
    if (savingNote || !summary?.canAssess) return;
    if (customerNote.length > 3000) {
      setNoteError('客户备注最多3000字');
      return;
    }
    setSavingNote(true);
    setNoteError('');
    setNoteMessage('');
    try {
      const response = await fetch('/api/customer-projects/customer-workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          section: 'note',
          customerReferenceId,
          customerNote,
          expectedVersion: data?.workspace?.noteVersion ?? 0,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.message || '备注保存失败');
      setData(previous => {
        if (!previous) return previous;
        return {
          ...previous,
          workspace: {
            ...(previous.workspace ?? {
              opportunitySummary: '',
              estimatedAnnualOpportunityCnyYuan: null,
              nextAction: '',
              nextCheckOn: null,
              planVersion: 0,
              planUpdatedAt: null,
              noteVersion: 0,
              noteUpdatedAt: null,
              customerNote: '',
            }),
            customerNote,
            noteVersion: json.data.version,
          },
        };
      });
      setNoteMessage('客户备注已独立保存。');
    } catch (cause) {
      setNoteError(cause instanceof Error ? cause.message : '备注保存失败');
    } finally {
      setSavingNote(false);
    }
  }

  async function saveDevelopmentPlan() {
    if (savingPlan || !summary?.canAssess) return;
    const amount = estimatedAnnualCny.trim() ? Number(estimatedAnnualCny) : null;
    if (amount !== null &&
      (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000)) {
      setPlanError('预计可开发金额须为不超过10亿元的非负整数人民币元');
      return;
    }
    setSavingPlan(true);
    setPlanError('');
    setPlanMessage('');
    try {
      const response = await fetch('/api/customer-projects/customer-workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          section: 'plan',
          customerReferenceId,
          opportunitySummary,
          estimatedAnnualOpportunityCnyYuan: amount,
          nextAction,
          nextCheckOn: nextCheckOn || null,
          expectedVersion: data?.workspace?.planVersion ?? 0,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.message || '开发计划保存失败');
      setData(previous => {
        if (!previous) return previous;
        return {
          ...previous,
          workspace: {
            ...(previous.workspace ?? {
              opportunitySummary: '',
              estimatedAnnualOpportunityCnyYuan: null,
              nextAction: '',
              nextCheckOn: null,
              planVersion: 0,
              planUpdatedAt: null,
              noteVersion: 0,
              noteUpdatedAt: null,
              customerNote: '',
            }),
            opportunitySummary,
            estimatedAnnualOpportunityCnyYuan: amount,
            nextAction,
            nextCheckOn: nextCheckOn || null,
            planVersion: json.data.version,
          },
          summaries: previous.summaries.map(item =>
            item.customerReferenceId === customerReferenceId
              ? { ...item, nextAction: nextAction || null, nextCheckOn: nextCheckOn || null }
              : item),
        };
      });
      setPlanMessage('客户开发计划已独立保存，不影响潜力评分。');
    } catch (cause) {
      setPlanError(cause instanceof Error ? cause.message : '开发计划保存失败');
    } finally {
      setSavingPlan(false);
    }
  }

  function cancelRatingEdit() {
    setScores(data?.detail?.scores ?? emptyScores());
    setEvidenceSummary(data?.detail?.evidenceSummary ?? '');
    setRatingError('');
    setRatingExpanded(false);
  }

  return (
    <section id="customer-value-rating" className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">客户价值评估</h2>
            <p className="mt-1 text-xs text-slate-500">
              实际评级根据财务确认回款；潜力评级由客户负责人评估、管理者审核。
            </p>
          </div>
          {summary && (
            <div className="flex flex-wrap items-center gap-2">
              <CustomerRatingBadge axis="actual" grade={summary.actualGrade} />
              <CustomerRatingBadge axis="potential" grade={summary.potentialGrade} />
            </div>
          )}
        </div>

        {loading && <p className="mt-3 text-sm text-slate-500">正在读取客户信息...</p>}
        {!loading && loadError && (
          <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {loadError}。请勿按0元或未核实数据给客户定级。
          </p>
        )}
        {summary && (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <div className="space-y-1">
                <p className="text-xs text-slate-600">
                  潜力状态：<span className="font-medium">{STATUS_LABEL[summary.potentialStatus]}</span>
                  {summary.potentialScore !== null ? ' · 已审核' + summary.potentialScore + '分' : ''}
                  {data?.detail?.status === 'pending_review'
                    ? ' · 待审' + data.detail.assessmentScore + '分' : ''}
                </p>
                <p className="text-xs text-slate-500">
                  客户维护人：{summary.maintenanceOwnerName || '待完成归属映射'}
                  {summary.actualGrade === 'N' ? ' · 实际回款尚未核实' : ''}
                </p>
              </div>
              {(summary.canAssess || data?.canReview) && (
                <button
                  type="button"
                  aria-expanded={ratingExpanded}
                  aria-controls="customer-potential-rating-editor"
                  onClick={() => ratingExpanded ? cancelRatingEdit() : setRatingExpanded(true)}
                  className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                >
                  {ratingExpanded ? '收起评级编辑' :
                    data?.canReview && data?.detail?.status === 'pending_review'
                      ? '编辑 / 审核评级'
                      : '编辑评级'}
                </button>
              )}
            </div>
            <div className="mt-2"><CustomerRatingLegend /></div>
            {ratingMessage && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{ratingMessage}</p>}

            {ratingExpanded && (
              <div id="customer-potential-rating-editor" className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/30 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">潜力评级 · 五项评分与事实依据</h3>
                  {preview ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">本次试算 {preview.score}分</span>
                      <CustomerRatingBadge axis="potential" grade={preview.grade} preview />
                    </div>
                  ) : <span className="text-xs text-slate-500">尚未完成五项评分</span>}
                </div>

                {summary.canAssess && (
                  <>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {POTENTIAL_RATING_DIMENSIONS.map(dim => (
                        <label key={dim.key} className="rounded-lg border border-slate-100 bg-white p-3">
                          <span className="block text-sm font-semibold text-slate-800">
                            {dim.name}<span className="ml-1 text-xs font-normal text-slate-500">权重{POTENTIAL_RATING_WEIGHTS[dim.key]}%</span>
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">{dim.description}</span>
                          <select
                            value={scores[dim.key]}
                            onChange={event => setScores(previous => ({
                              ...previous, [dim.key]: Number(event.target.value),
                            }))}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value={-1}>请选择0–5分（未知暂不评分）</option>
                            {[0, 1, 2, 3, 4, 5].map(value => (
                              <option key={value} value={value}>{value}分</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <label className="mt-3 block text-xs font-semibold text-slate-700">
                      客户事实与可核实依据（提交审核至少20字）
                      <textarea
                        value={evidenceSummary}
                        onChange={event => setEvidenceSummary(event.target.value)}
                        rows={3}
                        maxLength={3000}
                        placeholder="请说明客户实际需求、采购规模判断、工艺适配及项目证据"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingRating}
                        onClick={() => void saveRating(false)}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                      >保存评级草稿并收起</button>
                      <button
                        type="button"
                        disabled={savingRating}
                        onClick={() => void saveRating(true)}
                        className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >提交管理者审核并收起</button>
                      <button
                        type="button"
                        disabled={savingRating}
                        onClick={cancelRatingEdit}
                        className="rounded-lg px-3 py-2 text-sm text-slate-500"
                      >取消</button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      这里只保存评级评分及依据，不会改动下方客户备注或开发计划。
                    </p>
                  </>
                )}

                {data?.canReview && data.detail?.status === 'pending_review' && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">经理审核待审批评级</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-amber-900">本轮评分 {data.detail.assessmentScore}分</span>
                      <CustomerRatingBadge axis="potential" grade={data.detail.assessmentGrade} preview />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-amber-900">
                      评估依据：{data.detail.evidenceSummary || '暂无依据'}
                    </p>
                    <textarea
                      value={reviewNote}
                      onChange={event => setReviewNote(event.target.value)}
                      rows={2}
                      placeholder="审核意见；退回时至少填写5字原因"
                      className="mt-3 w-full rounded-lg border border-amber-300 bg-white p-3 text-sm"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" disabled={savingRating} onClick={() => void review('approve')}
                        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >批准并生效</button>
                      <button type="button" disabled={savingRating} onClick={() => void review('request_changes')}
                        className="rounded-lg border border-amber-500 px-4 py-2 text-sm text-amber-900 disabled:opacity-50"
                      >退回补充</button>
                    </div>
                  </div>
                )}
                {data?.detail?.reviewNote && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    最近审核意见：{data.detail.reviewNote}
                  </p>
                )}
                {ratingError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{ratingError}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {summary && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">客户备注</h3>
              <span className="text-xs text-slate-500">仅CPC内部记录 · 与评级独立</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              记录特殊要求、沟通注意事项、包装/交付习惯等补充信息，不修改外部客户主档案。
            </p>
            <textarea
              value={customerNote}
              onChange={event => { setCustomerNote(event.target.value); setNoteMessage(''); }}
              rows={3}
              maxLength={3000}
              disabled={!summary.canAssess || savingNote}
              placeholder={summary.canAssess ? '例如：客户要求出货前提供首箱照片；联系采购需提前预约' : '尚未填写客户备注'}
              className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm disabled:bg-slate-50"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {customerNote.length}/3000字
                {data?.workspace?.noteUpdatedAt ? ' · 已保存过客户备注' : ''}
              </span>
              {summary.canAssess && (
                <button type="button" disabled={savingNote} onClick={() => void saveCustomerNote()}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {savingNote ? '保存中...' : '保存客户备注'}
                </button>
              )}
            </div>
            {noteMessage && <p role="status" className="mt-2 text-xs text-emerald-700">{noteMessage}</p>}
            {noteError && <p role="alert" className="mt-2 text-xs text-rose-700">{noteError}</p>}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">客户开发机会与销售行动</h3>
                <p className="mt-1 text-xs text-slate-500">
                  常驻展开，可随时更新。独立保存，既不会修改评级，也不会自动生成正式回访任务。
                </p>
              </div>
              <span className="text-xs text-slate-500">
                维护人：{summary.maintenanceOwnerName || '待映射'}
              </span>
            </div>

            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">经营建议：{summary.strategy.label}</p>
              <p className="mt-1 text-slate-600">{summary.strategy.action}</p>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700 lg:col-span-2">
                未来12个月主要开发机会
                <textarea
                  rows={3}
                  maxLength={2000}
                  disabled={!summary.canAssess || savingPlan}
                  value={opportunitySummary}
                  onChange={event => { setOpportunitySummary(event.target.value); setPlanMessage(''); }}
                  placeholder="说明拟争取的产品、工艺、打样或合作机会（与评分依据分开）"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm disabled:bg-slate-50"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                预计可争取年采购金额（人民币元，非实际回款）
                <input
                  type="number" min="0" max="1000000000" step="1"
                  value={estimatedAnnualCny}
                  onChange={event => { setEstimatedAnnualCny(event.target.value); setPlanMessage(''); }}
                  disabled={!summary.canAssess || savingPlan}
                  placeholder="如无充分依据可留空"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                下一步检查日期（北京时间）
                <input
                  type="date"
                  value={nextCheckOn}
                  onChange={event => { setNextCheckOn(event.target.value); setPlanMessage(''); }}
                  disabled={!summary.canAssess || savingPlan}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700 lg:col-span-2">
                具体下一步销售行动
                <input
                  type="text"
                  maxLength={300}
                  value={nextAction}
                  onChange={event => { setNextAction(event.target.value); setPlanMessage(''); }}
                  disabled={!summary.canAssess || savingPlan}
                  placeholder="例如：联系客户采购确认第二款热转印花膜打样数量"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {summary.canAssess && (
                <button type="button" disabled={savingPlan} onClick={() => void saveDevelopmentPlan()}
                  className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {savingPlan ? '保存中...' : '保存开发机会与销售计划'}
                </button>
              )}
              <Link href={'/customer-projects/projects/new?customerReferenceId=' + encodeURIComponent(customerReferenceId)}
                className="text-xs font-semibold text-cyan-700 hover:underline">
                有明确商业机会？创建项目
              </Link>
              {data?.workspace?.planUpdatedAt && (
                <span className="text-xs text-slate-400">已保存过开发计划</span>
              )}
            </div>
            {planMessage && <p role="status" className="mt-2 text-xs text-emerald-700">{planMessage}</p>}
            {planError && <p role="alert" className="mt-2 text-xs text-rose-700">{planError}</p>}
          </div>
        </>
      )}
    </section>
  );
}
