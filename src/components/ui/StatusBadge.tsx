'use client';
import { cn, getStatusBadgeClass, getStatusLabel } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn(getStatusBadgeClass(status), className)}>
      {getStatusLabel(status)}
    </span>
  );
}
