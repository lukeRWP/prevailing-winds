import Link from 'next/link';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VmStatus } from '@/types/api';

const ENV_BADGE: Record<string, string> = {
  dev: 'bg-blue-500/20 text-blue-400',
  qa: 'bg-amber-500/20 text-amber-400',
  prod: 'bg-emerald-500/20 text-emerald-400',
};

const STATUS_DOT: Record<string, string> = {
  running: 'bg-emerald-500',
  stopped: 'bg-red-500',
  unknown: 'bg-zinc-500',
};

interface EnvironmentCardProps {
  name: string;
  vlan: number;
  cidr: string;
  vms: VmStatus[];
  pipeline?: { autoDeployBranch?: string; deployOnTag?: string };
}

export function EnvironmentCard({ name, vlan, cidr, vms, pipeline }: EnvironmentCardProps) {
  const runningCount = vms.filter((vm) => vm.status === 'running').length;
  const badgeClass = ENV_BADGE[name] || 'bg-zinc-500/20 text-zinc-400';

  return (
    <Link
      href={`/environments/${name}`}
      className="block rounded-lg border border-border bg-card p-4 hover:border-zinc-600 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', badgeClass)}>
            {name.toUpperCase()}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          VLAN {vlan}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground font-mono">{cidr}</p>

      {/* VM status dots */}
      <div className="mt-3 flex items-center gap-3">
        {vms.map((vm) => (
          <div key={vm.name} className="flex items-center gap-1.5">
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                STATUS_DOT[vm.status] || STATUS_DOT.unknown,
                vm.status === 'running' && 'animate-pulse'
              )}
            />
            <span className="text-[10px] text-muted-foreground">{vm.role}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {runningCount}/{vms.length} running
        </span>
        {pipeline && (
          <span className="text-[10px] text-muted-foreground">
            {pipeline.autoDeployBranch
              ? `auto: ${pipeline.autoDeployBranch}`
              : pipeline.deployOnTag
                ? `tag: ${pipeline.deployOnTag}`
                : ''}
          </span>
        )}
      </div>
    </Link>
  );
}
