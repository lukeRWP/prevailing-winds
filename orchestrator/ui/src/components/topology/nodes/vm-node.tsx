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

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)}G`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)}M`;
  return `${(bytes / 1024).toFixed(0)}K`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export interface VmNodeData {
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
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  netin?: number;
  netout?: number;
  envName?: string;
  appName?: string;
}

function VmNodeComponent({ data }: { data: VmNodeData }) {
  const Icon = ICON_MAP[data.icon] || Server;
  const hasMetrics = data.status === 'running' && data.cpu !== undefined;

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

      {hasMetrics && (
        <div className="mt-1 text-[9px] text-muted-foreground flex items-center gap-1.5">
          <span>CPU {Math.round((data.cpu || 0) * 100)}%</span>
          <span className="text-zinc-600">·</span>
          <span>RAM {data.mem ? formatBytes(data.mem) : '?'}/{data.maxmem ? formatBytes(data.maxmem) : '?'}</span>
        </div>
      )}

      {(data.vmid !== undefined || data.uptime !== undefined) && (
        <div className="mt-0.5 text-[9px] text-zinc-500 flex items-center gap-1.5">
          {data.vmid !== undefined && <span>ID:{data.vmid}</span>}
          {data.node && (
            <>
              <span className="text-zinc-600">·</span>
              <span>{data.node}</span>
            </>
          )}
          {data.uptime !== undefined && data.uptime > 0 && (
            <>
              <span className="text-zinc-600">·</span>
              <span>{formatUptime(data.uptime)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const VmNode = memo(VmNodeComponent);
