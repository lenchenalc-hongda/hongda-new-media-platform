'use client';

export type CaseHideContext = 'NORMAL_HIDE' | 'RECURATE';

interface CaseManageActionBarProps {
  status: string;
  isStale: boolean;
  dirty: boolean;
  mutationInFlight: boolean;
  stateLocked: boolean;
  onPublish: () => void;
  onHide: (context: CaseHideContext) => void;
  onReopen: () => void;
}

export default function CaseManageActionBar({
  status,
  isStale,
  dirty,
  mutationInFlight,
  stateLocked,
  onPublish,
  onHide,
  onReopen,
}: CaseManageActionBarProps) {
  const disabled = mutationInFlight || stateLocked;

  if (status === 'DRAFT') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={disabled || dirty}
          onClick={onPublish}
        >
          发布案例
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || dirty}
          onClick={() => onHide('NORMAL_HIDE')}
        >
          隐藏案例
        </button>
      </div>
    );
  }

  if (status === 'PUBLISHED') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={isStale ? 'btn-primary' : 'btn-secondary'}
          disabled={disabled}
          onClick={() => onHide('RECURATE')}
        >
          重新整理
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled}
          onClick={() => onHide('NORMAL_HIDE')}
        >
          隐藏案例
        </button>
      </div>
    );
  }

  if (status === 'HIDDEN') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled}
          onClick={onReopen}
        >
          重新打开整理
        </button>
      </div>
    );
  }

  return null;
}
