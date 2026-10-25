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
  opportunitySummary: string;
  estimatedAnnualOpportunityCnyYuan: number | null;
  nextAction: string;
  nextCheckOn: string | null;
  status: PotentialRatingStatus;
  publishedGrade: PotentialRatingGrade | null;
  publishedScore: number | null;
  publishedAt: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  version: number;
  updatedAt: string;
};

type RatingResponse = {
  summaries: RatingSummary[];
  detail: RatingDetail | null;
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (resetInputs: boolean) => {
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
      if (resetInputs) {
        const detail = info.detail;
        setScores(detail?.scores ?? emptyScores());
        setEvidenceSummary(detail?.evidenceSummary ?? '');
        setOpportunitySummary(detail?.opportunitySummary ?? '');
        setEstimatedAnnualCny(detail?.estimatedAnnualOpportunityCnyYuan == null
          ? '' : String(detail.estimatedAnnualOpportunityCnyYuan));
        setNextAction(detail?.nextAction ?? '');
        setNextCheckOn(detail?.nextCheckOn ?? '');
        setReviewNote(detail?.reviewNote ?? '');
      }
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : '评级读取失败');
    } finally {
      setLoading(false);
    }
  }, [customerReferenceId]);

  useEffect(() => {
    setLoading(true);
    void load(true);
  }, [load]);

  const summary = data?.summaries[0] ?? null;
  const scoresComplete = POTENTIAL_RATING_DIMENSIONS.every(({ key }) =>
    Number.isInteger(scores[key]) && scores[key] >= 0 && scores[key] <= 5,
  );
  const preview = useMemo(
    () => scoresComplete ? calculatePotentialRating(scores) : null,
    [scores, scoresComplete],
  );

  async function save(submit: boolean) {
    if (saving || !summary?.canAssess) return;
    if (!preview) { setError('请先为五个评分维度分别选择0–5分。'); return; }
    if (
      submit
      && (evidenceSummary.trim().length < 20
        || opportunitySummary.trim().length < 10
        || nextAction.trim().length < 5
        || !nextCheckOn)
    ) {
      setError('提交审核需要填写客户事实依据、明确机会、下一步动作和日期。');
      return;
    }
    const amount = estimatedAnnualCny.trim() ? Number(estimatedAnnualCny) : null;
    if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000)) {
      setError('预计可开发金额须为有效的非负人民币整数。');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/customer-projects/customer-ratings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerReferenceId,
          scores,
          evidenceSummary,
          opportunitySummary,
          estimatedAnnualOpportunityCnyYuan: amount,
          nextAction,
          nextCheckOn: nextCheckOn || null,
          submit,
          expectedVersion: data?.detail?.version ?? null,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.message || '潜力评级保存失败');
      await load(true);
      setMessage(submit ? '已提交管理者审核。批准前不会生效为正式潜力等级。' : '评分草稿已保存。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '评级保存失败');
      await load(false);
    } finally { setSaving(false); }
  }

  async function review(decision: 'approve' | 'request_changes') {
    if (saving || !data?.canReview || !data.detail) return;
    if (decision === 'request_changes' && reviewNote.trim().length < 5) {
      setError('退回时请填写至少5个字的修改原因。'); return;
    }
    setSaving(true); setError(''); setMessage('');
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
      await load(true);
      setMessage(decision === 'approve' ? '潜力等级已正式批准并记录审计。' : '已退回业务员补充依据。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '审核失败');
      await load(false);
    } finally { setSaving(false); }
  }

  return (
    <section id="customer-value-rating" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">客户价值评估 · R实际 / P潜力</h2>
          <p className="mt-1 text-xs text-slate-500">
            实际评级依据财务回款；潜力评级由维护人提供事实并经管理者审核。不同于原有A/B/C关系回访分类。
          </p>
        </div>
        {summary && <div className="flex flex-wrap items-center gap-2">
          <CustomerRatingBadge axis="actual" grade={summary.actualGrade} />
          <CustomerRatingBadge axis="potential" grade={summary.potentialGrade} />
        </div>}
      </div>

      {loading && <p className="text-sm text-slate-500">正在读取客户评级...</p>}
      {!loading && loadError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {loadError}。请勿在未知数据状态下手动判级。
        </p>
      )}

      {summary && (
        <div className="space-y-4">
          <CustomerRatingLegend />
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">实际评级 R · 过去12个月</p>
              <div className="mt-2"><CustomerRatingBadge axis="actual" grade={summary.actualGrade} /></div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{summary.actualExplanation}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">潜力评级 P · 已审核等级</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <CustomerRatingBadge axis="potential" grade={summary.potentialGrade} />
                {summary.potentialScore !== null && (
                  <span className="text-xs font-medium text-slate-600">{summary.potentialScore}分（已审核）</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {STATUS_LABEL[summary.potentialStatus]}
                {data?.detail?.status === 'pending_review'
                  ? ' · 本轮待审' + data.detail.assessmentScore + '分'
                  : ''}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">负责维护人 · 来源客户池映射</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {summary.maintenanceOwnerName || '尚未完成负责人映射'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {summary.canAssess ? '当前账号可维护该客户的潜力评分' : '只有真实客户负责人或管理者可填写潜力评分'}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-medium text-slate-900">销售经营建议：{summary.strategy.label}</p>
            <p className="mt-1 text-slate-600">{summary.strategy.action}</p>
            {summary.nextAction && (
              <p className="mt-2 text-slate-700">
                <span className="font-medium">已记录的下一步：</span>
                {summary.nextAction}{summary.nextCheckOn ? ' · ' + summary.nextCheckOn : ''}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              此处保存销售计划依据，不会自动创建正式回访任务；正式跟进请使用下方客户回访和项目入口。
            </p>
            <Link
              href={'/customer-projects/projects/new?customerReferenceId=' + encodeURIComponent(customerReferenceId)}
              className="mt-2 inline-block text-xs font-medium text-cyan-700 hover:underline"
            >有明确商业机会？创建项目</Link>
          </div>

          {summary.canAssess && (
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">内部潜力评分</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {preview ? (
                    <>
                      <span className="text-xs text-slate-500">本次试算 {preview.score}分</span>
                      <CustomerRatingBadge axis="potential" grade={preview.grade} preview />
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">五项未评完</span>
                  )}
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {POTENTIAL_RATING_DIMENSIONS.map(dim => (
                  <label key={dim.key} className="rounded-lg bg-slate-50 p-3">
                    <span className="block text-sm font-medium text-slate-800">
                      {dim.name}<span className="ml-1 text-xs text-slate-400">权重{POTENTIAL_RATING_WEIGHTS[dim.key]}%</span>
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{dim.description}</span>
                    <select
                      value={scores[dim.key]}
                      onChange={event => setScores(previous => ({
                        ...previous,
                        [dim.key]: Number(event.target.value),
                      }))}
                      className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value={-1}>请选择 0–5 分（未知暂不评分）</option>
                      {[0, 1, 2, 3, 4, 5].map(value => (
                        <option value={value} key={value}>{value} 分</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="block text-xs font-medium text-slate-700">
                  客户事实和可核实依据（提交需至少20字）
                  <textarea rows={3} value={evidenceSummary} onChange={e => setEvidenceSummary(e.target.value)}
                    placeholder="产品、采购计划、主要联系人及实际证据；不要凭客户规模臆测"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/>
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  未来12个月主要开发机会（提交需至少10字）
                  <textarea rows={3} value={opportunitySummary} onChange={e => setOpportunitySummary(e.target.value)}
                    placeholder="例如：PP水杯第二条花膜产品线，目标打样与预估数量"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/>
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  预计可争取年采购金额（人民币元，非实际回款）
                  <input type="number" min="0" max="1000000000" step="1"
                    value={estimatedAnnualCny} onChange={e => setEstimatedAnnualCny(e.target.value)}
                    placeholder="选填；如无依据请留空"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/>
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  具体下一步销售行动（提交需至少5字）
                  <input value={nextAction} onChange={e => setNextAction(e.target.value)}
                    placeholder="例如：联系采购确认第二款花膜打样要求"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/>
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  下一步检查日期（北京时间）
                  <input type="date" value={nextCheckOn} onChange={e => setNextCheckOn(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void save(false)} disabled={saving}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">
                  保存草稿
                </button>
                <button type="button" onClick={() => void save(true)} disabled={saving}
                  className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  提交管理者审核
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">变更须留审计记录；上一次已批准等级在本轮审核结束前仍为正式等级。</p>
            </div>
          )}

          {data?.canReview && data.detail?.status === 'pending_review' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-900">管理者审核 · 待审批</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm text-amber-900">本次待审评分 {data.detail.assessmentScore} 分</span>
                <CustomerRatingBadge axis="potential" grade={data.detail.assessmentGrade} preview />
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs text-amber-900">
                评估依据：{data.detail.evidenceSummary}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-amber-900">
                商业机会：{data.detail.opportunitySummary}
              </p>
              <textarea rows={2} value={reviewNote} onChange={event => setReviewNote(event.target.value)}
                placeholder="审核意见；退回时必须说明理由"
                className="mt-3 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"/>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void review('approve')} disabled={saving}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                  批准并生效
                </button>
                <button type="button" onClick={() => void review('request_changes')} disabled={saving}
                  className="rounded-lg border border-amber-500 px-3 py-2 text-sm text-amber-900 disabled:opacity-50">
                  退回补充
                </button>
              </div>
            </div>
          )}
          {data?.detail?.reviewNote && (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              最近审核意见：{data.detail.reviewNote}
            </p>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        </div>
      )}
    </section>
  );
}
