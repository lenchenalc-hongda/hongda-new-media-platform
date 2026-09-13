'use client';
import type { ActionReadDto } from '@/lib/review-center/actions';
import {
  actionStatusBadgeClass,
  actionStatusLabel,
  actionTypeLabel,
  formatActionDueDate,
  type ActionPresentationCapabilities,
} from '@/lib/review-center/action-presentation';
import { formatReviewDateTime } from '@/lib/review-center/formatters';
import { formatAuthRoleLabel } from '@/lib/review-center/timeline-presentation';

interface ActionCardProps {
  action: ActionReadDto;
  capabilities: ActionPresentationCapabilities;
  expanded: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onStart: () => void;
  onSubmit: () => void;
  onVerify: () => void;
  onReturn: () => void;
  onCancel: () => void;
}

function profileLabel(profile: ActionReadDto['owner']) {
  const parts = [profile.displayName];
  if (profile.department) parts.push(profile.department);
  if (!profile.isActive) parts.push('已停用');
  return parts.join(' · ');
}

export default function ActionCard({
  action,
  capabilities,
  expanded,
  pending,
  disabled,
  onToggle,
  onEdit,
  onStart,
  onSubmit,
  onVerify,
  onReturn,
  onCancel,
}: ActionCardProps) {
  const muted = action.status === 'CANCELLED';
  const verified = action.status === 'VERIFIED';

  return (
    <div className={muted ? 'rounded-lg border border-gray-200 bg-gray-50 p-4' : 'rounded-lg border border-gray-200 bg-white p-4'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="mt-0.5 text-sm font-medium text-gray-800">
            行动项 #{action.sequence}
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium text-gray-800">
            {action.title}
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={actionStatusBadgeClass(action.status)}>
            {actionStatusLabel(action.status)}
          </span>
          <span className="badge-gray">{actionTypeLabel(action.actionType)}</span>
          {action.isOverdue && <span className="badge-red">逾期</span>}
          {verified && <span className="badge-green">已闭环</span>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>
          负责人：
          {action.owner.displayName}
          {action.owner.department ? ` · ${action.owner.department}` : ''}
          {!action.owner.isActive && (
            <span className="ml-1 rounded bg-gray-200 px-1 py-0.5 text-gray-600">已停用</span>
          )}
        </span>
        <span>截止日期：{formatActionDueDate(action.dueDate)}</span>
      </div>

      {pending && (
        <p className="mt-2 text-xs text-gray-400">处理中…</p>
      )}

      {expanded && (
        <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
          <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {action.description && (
              <div className="md:col-span-2">
                <dt className="text-xs text-gray-400">描述</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{action.description}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-gray-400">行动类型</dt>
              <dd className="mt-0.5">{actionTypeLabel(action.actionType)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">截止日期</dt>
              <dd className="mt-0.5">{formatActionDueDate(action.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">负责人</dt>
              <dd className="mt-0.5">{profileLabel(action.owner)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">创建人</dt>
              <dd className="mt-0.5">
                {profileLabel(action.createdBy)}
                {formatAuthRoleLabel(action.createdBy.role)
                  ? ` · ${formatAuthRoleLabel(action.createdBy.role)}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">创建时间</dt>
              <dd className="mt-0.5">{formatReviewDateTime(action.createdAt)}</dd>
            </div>
            {action.completionNote && (
              <div className="md:col-span-2">
                <dt className="text-xs text-gray-400">完成说明</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{action.completionNote}</dd>
              </div>
            )}
            {action.completedAt && (
              <div>
                <dt className="text-xs text-gray-400">完成时间</dt>
                <dd className="mt-0.5">{formatReviewDateTime(action.completedAt)}</dd>
              </div>
            )}
            {action.verificationNote && (
              <div className="md:col-span-2">
                <dt className="text-xs text-gray-400">验证意见</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{action.verificationNote}</dd>
              </div>
            )}
            {action.verifiedBy && (
              <div>
                <dt className="text-xs text-gray-400">验证人</dt>
                <dd className="mt-0.5">{profileLabel(action.verifiedBy)}</dd>
              </div>
            )}
            {action.verifiedAt && (
              <div>
                <dt className="text-xs text-gray-400">验证时间</dt>
                <dd className="mt-0.5">{formatReviewDateTime(action.verifiedAt)}</dd>
              </div>
            )}
            {action.cancelReason && (
              <div className="md:col-span-2">
                <dt className="text-xs text-gray-400">取消原因</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{action.cancelReason}</dd>
              </div>
            )}
            {action.cancelledAt && (
              <div>
                <dt className="text-xs text-gray-400">取消时间</dt>
                <dd className="mt-0.5">{formatReviewDateTime(action.cancelledAt)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {!verified && !muted && (
        <div className="mt-3 flex flex-wrap gap-2">
          {capabilities.canEdit && (
            <button type="button" disabled={disabled} onClick={onEdit} className="btn-secondary btn-sm">
              编辑
            </button>
          )}
          {capabilities.canStart && (
            <button type="button" disabled={disabled} onClick={onStart} className="btn-primary btn-sm">
              开始执行
            </button>
          )}
          {capabilities.canSubmit && (
            <button type="button" disabled={disabled} onClick={onSubmit} className="btn-secondary btn-sm">
              提交验证
            </button>
          )}
          {capabilities.canVerify && (
            <button type="button" disabled={disabled} onClick={onVerify} className="btn-primary btn-sm">
              验证通过
            </button>
          )}
          {capabilities.canReturn && (
            <button type="button" disabled={disabled} onClick={onReturn} className="btn-secondary btn-sm">
              退回修改
            </button>
          )}
          {capabilities.canCancel && (
            <button type="button" disabled={disabled} onClick={onCancel} className="btn-danger btn-sm">
              取消
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        className="mt-2 text-xs text-gray-400 hover:text-gray-600"
      >
        {expanded ? '收起详情' : '展开详情'}
      </button>
    </div>
  );
}
