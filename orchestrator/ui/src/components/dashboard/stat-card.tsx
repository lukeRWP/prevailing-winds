import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: { value: string; positive: boolean };
}

export function StatCard({ label, value, icon: Icon, description, trend }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {(description || trend) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {trend && (
            <span className={cn('font-medium', trend.positive ? 'text-emerald-400' : 'text-red-400')}>
              {trend.value}
            </span>
          )}
          {trend && description && ' · '}
          {description}
        </p>
      )}
    </div>
  );
}
