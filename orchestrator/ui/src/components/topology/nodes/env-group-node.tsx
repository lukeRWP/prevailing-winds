import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const ENV_COLORS: Record<string, string> = {
  dev: 'border-blue-500/40 bg-blue-500/5',
  qa: 'border-amber-500/40 bg-amber-500/5',
  prod: 'border-emerald-500/40 bg-emerald-500/5',
};

const ENV_BADGE_COLORS: Record<string, string> = {
  dev: 'bg-blue-500/20 text-blue-400',
  qa: 'bg-amber-500/20 text-amber-400',
  prod: 'bg-emerald-500/20 text-emerald-400',
};

interface EnvGroupNodeData {
  label: string;
  vlan: number;
  cidr: string;
  gateway?: string;
  width: number;
  height: number;
  envName: string;
}

function EnvGroupNodeComponent({ data }: { data: EnvGroupNodeData }) {
  const colorClass = ENV_COLORS[data.envName] || 'border-border bg-card/50';
  const badgeClass = ENV_BADGE_COLORS[data.envName] || 'bg-zinc-500/20 text-zinc-400';

  return (
    <div
      className={`rounded-xl border-2 ${colorClass} transition-colors`}
      style={{ width: data.width, height: data.height }}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !w-2.5 !h-2.5" />

      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
          {data.label}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          VLAN {data.vlan} · {data.cidr}
        </span>
      </div>
    </div>
  );
}

export const EnvGroupNode = memo(EnvGroupNodeComponent);
