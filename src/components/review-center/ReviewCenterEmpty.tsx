'use client';
import Link from 'next/link';

interface ReviewCenterEmptyProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export default function ReviewCenterEmpty({ title, description, action }: ReviewCenterEmptyProps) {
  return (
    <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
      <p className="text-gray-400 text-4xl mb-3">📭</p>
      <p className="text-gray-600 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      {action && (
        <Link href={action.href} className="btn-primary mt-4 inline-block">
          {action.label}
        </Link>
      )}
    </div>
  );
}
