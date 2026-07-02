'use client';

interface AiResultCardProps {
  title: string;
  content: Record<string, any>;
  onApply?: () => void;
  onDismiss?: () => void;
}

export default function AiResultCard({ title, content, onApply, onDismiss }: AiResultCardProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-blue-600">🤖</span>
          <h3 className="font-medium text-blue-800">{title}</h3>
        </div>
        <div className="flex gap-2">
          {onApply && <button onClick={onApply} className="btn-primary btn-sm">应用</button>}
          {onDismiss && <button onClick={onDismiss} className="btn-secondary btn-sm">关闭</button>}
        </div>
      </div>
      <div className="text-sm text-gray-700 space-y-1">
        {Object.entries(content).slice(0, 8).map(([key, value]) => (
          <div key={key}>
            <span className="font-medium text-gray-500">{key}: </span>
            <span>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
