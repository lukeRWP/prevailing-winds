import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Monitor,
  Server,
  Database,
  HardDrive,
  Shield,
  Play,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ElementType> = {
  monitor: Monitor,
  server: Server,
  database: Database,
  'hard-drive': HardDrive,
  shield: Shield,
  play: Play,
  cpu: Cpu,
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-emerald-500',
  stopped: 'bg-red-500',
  unknown: 'bg-zinc-500',
};

interface VmNodeData {
  label: string;
  role: string;
  ip: string;
  externalIp?: string;
  icon: string;
  status: string;
  services?: string[];
  isShared?: boolean;
  vmid?: number;
  node?: string;
  envName?: string;
}

function VmNodeComponent({ data }: { data: VmNodeData }) {
  const Icon = ICON_MAP[data.icon] || Server;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-3 py-2 shadow-sm transition-all hover:shadow-md cursor-pointer',
        'min-w-[120px]',
        data.status === 'running'
          ? 'border-emerald-500/30'
          : data.status === 'stopped'
            ? 'border-red-500/30'
            : 'border-border'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-600 !w-2 !h-2" />

      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">
          {data.label}
        </span>
        <div
          className={cn(
            'h-2 w-2 rounded-full shrink-0 ml-auto',
            STATUS_COLORS[data.status] || STATUS_COLORS.unknown,
            data.status === 'running' && 'animate-pulse'
          )}
        />
      </div>

      <div className="mt-1 text-[10px] text-muted-foreground font-mono">
        {data.ip}
      </div>

      {data.externalIp && (
        <div className="text-[10px] text-indigo-400 font-mono">
          ext: {data.externalIp}
        </div>
      )}
    </div>
  );
}

export const VmNode = memo(VmNodeComponent);
