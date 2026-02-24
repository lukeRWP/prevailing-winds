'use client';

import { X, Monitor, Server, Database, HardDrive, Shield, Play, Cpu } from 'lucide-react';
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  running: { label: 'Running', color: 'text-emerald-400' },
  stopped: { label: 'Stopped', color: 'text-red-400' },
  unknown: { label: 'Unknown', color: 'text-zinc-400' },
};

interface VmDetailPanelProps {
  data: {
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
  } | null;
  onClose: () => void;
}

export function VmDetailPanel({ data, onClose }: VmDetailPanelProps) {
  if (!data) return null;

  const Icon = ICON_MAP[data.icon] || Server;
  const statusInfo = STATUS_LABELS[data.status] || STATUS_LABELS.unknown;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-card border-l border-border z-50 flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground">{data.label}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <p className={cn('text-sm font-medium', statusInfo.color)}>
            {statusInfo.label}
          </p>
        </div>

        {/* Details */}
        <div className="space-y-2">
          <DetailRow label="Role" value={data.role} />
          <DetailRow label="Internal IP" value={data.ip} mono />
          {data.externalIp && (
            <DetailRow label="External IP" value={data.externalIp} mono />
          )}
          {data.vmid !== undefined && (
            <DetailRow label="VM ID" value={String(data.vmid)} mono />
          )}
          {data.node && (
            <DetailRow label="Proxmox Node" value={data.node} />
          )}
          {data.envName && (
            <DetailRow label="Environment" value={data.envName.toUpperCase()} />
          )}
          {data.isShared && (
            <DetailRow label="Type" value="Shared Infrastructure" />
          )}
        </div>

        {/* Services */}
        {data.services && data.services.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Services</p>
            <div className="space-y-1">
              {data.services.map((svc) => (
                <div
                  key={svc}
                  className="text-xs bg-accent/50 rounded px-2 py-1 text-foreground"
                >
                  {svc}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs text-foreground', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}
