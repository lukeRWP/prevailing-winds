'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Monitor, Server, Database, HardDrive, Shield, Play, Cpu,
  Download, Square, ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VmNodeData } from './nodes/vm-node';

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

// Map VM roles to the log services available on that host
const ROLE_SERVICES: Record<string, string[]> = {
  server: ['imp-server-out', 'imp-server-err', 'app-server'],
  client: ['app-client', 'nginx-access', 'nginx-error'],
  database: ['mysql', 'mysql-slow'],
  storage: ['minio'],
};

const SERVICE_LABELS: Record<string, string> = {
  'app-server': 'App Server (systemd)',
  'imp-server-out': 'IMP Server Log',
  'imp-server-err': 'IMP Server Errors',
  'app-client': 'App Client (systemd)',
  'nginx-access': 'Nginx Access',
  'nginx-error': 'Nginx Error',
  'mysql': 'MySQL Error',
  'mysql-slow': 'MySQL Slow Query',
  'minio': 'MinIO',
};

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatNetBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

interface VmDetailPanelProps {
  data: VmNodeData | null;
  onClose: () => void;
}

export function VmDetailPanel({ data, onClose }: VmDetailPanelProps) {
  if (!data) return null;

  const Icon = ICON_MAP[data.icon] || Server;
  const statusInfo = STATUS_LABELS[data.status] || STATUS_LABELS.unknown;
  const hasMetrics = data.status === 'running' && data.cpu !== undefined;
  const availableServices = ROLE_SERVICES[data.role] || [];
  const showLogs = !data.isShared && data.envName && data.appName && availableServices.length > 0;

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
          {data.uptime !== undefined && data.uptime > 0 && (
            <DetailRow label="Uptime" value={formatUptime(data.uptime)} />
          )}
        </div>

        {/* Resources */}
        {hasMetrics && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Resources</p>
            <div className="space-y-2.5">
              <ResourceBar
                label="CPU"
                value={Math.round((data.cpu || 0) * 100)}
                suffix={data.maxcpu ? `${data.maxcpu} cores` : undefined}
              />
              {data.mem !== undefined && data.maxmem !== undefined && (
                <ResourceBar
                  label="Memory"
                  value={Math.round((data.mem / data.maxmem) * 100)}
                  detail={`${formatBytes(data.mem)} / ${formatBytes(data.maxmem)}`}
                />
              )}
              {data.disk !== undefined && data.maxdisk !== undefined && data.maxdisk > 0 && (
                <ResourceBar
                  label="Disk"
                  value={Math.round((data.disk / data.maxdisk) * 100)}
                  detail={`${formatBytes(data.disk)} / ${formatBytes(data.maxdisk)}`}
                />
              )}
            </div>

            {/* Network I/O */}
            {(data.netin !== undefined || data.netout !== undefined) && (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] text-muted-foreground">Network I/O</p>
                <div className="flex gap-4 text-[10px]">
                  {data.netin !== undefined && (
                    <span className="text-emerald-400">
                      ↓ {formatNetBytes(data.netin)}
                    </span>
                  )}
                  {data.netout !== undefined && (
                    <span className="text-blue-400">
                      ↑ {formatNetBytes(data.netout)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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

        {/* Logs */}
        {showLogs && (
          <LogViewer
            appName={data.appName!}
            envName={data.envName!}
            services={availableServices}
          />
        )}
      </div>
    </div>
  );
}

function ResourceBar({
  label,
  value,
  detail,
  suffix,
}: {
  label: string;
  value: number;
  detail?: string;
  suffix?: string;
}) {
  const barColor =
    value > 90 ? 'bg-red-500' : value > 70 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] text-foreground">
          {value}%{suffix ? ` · ${suffix}` : ''}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      {detail && (
        <p className="text-[9px] text-zinc-500 mt-0.5">{detail}</p>
      )}
    </div>
  );
}

function LogViewer({
  appName,
  envName,
  services,
}: {
  appName: string;
  envName: string;
  services: string[];
}) {
  const [selectedService, setSelectedService] = useState(services[0] || '');
  const [lines, setLines] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Reset when service changes
  useEffect(() => {
    stopStream();
    setLines([]);
  }, [selectedService]);

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  function stopStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreaming(false);
  }

  const handleSnapshot = useCallback(async () => {
    if (!selectedService) return;
    setLoading(true);
    setLines([]);
    stopStream();

    try {
      const res = await fetch(
        `/api/proxy/_x_/apps/${appName}/envs/${envName}/server-logs/snapshot?service=${selectedService}&lines=100`
      );
      const data = await res.json();
      if (data.success) {
        setLines(data.data.lines || []);
      } else {
        setLines([`Error: ${data.message}`]);
      }
    } catch {
      setLines(['Error: Failed to fetch logs']);
    } finally {
      setLoading(false);
    }
  }, [selectedService, appName, envName]);

  const startStream = useCallback(() => {
    if (!selectedService) return;
    stopStream();
    setLines([]);
    setStreaming(true);

    const url = `/api/proxy/_x_/apps/${appName}/envs/${envName}/server-logs/stream?service=${selectedService}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('log', (event) => {
      try {
        const line = JSON.parse(event.data);
        setLines((prev) => [...prev.slice(-500), line]);
      } catch {
        setLines((prev) => [...prev.slice(-500), event.data]);
      }
    });

    es.addEventListener('done', () => {
      setStreaming(false);
      es.close();
    });

    es.onerror = () => {
      setStreaming(false);
      es.close();
    };
  }, [selectedService, appName, envName]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <ScrollText className="h-3 w-3 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Logs</p>
      </div>

      {/* Service selector + controls */}
      <div className="flex items-center gap-1.5 mb-2">
        <select
          value={selectedService}
          onChange={(e) => setSelectedService(e.target.value)}
          className="flex-1 rounded border border-border bg-zinc-900 px-1.5 py-1 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {services.map((svc) => (
            <option key={svc} value={svc}>
              {SERVICE_LABELS[svc] || svc}
            </option>
          ))}
        </select>

        <button
          onClick={handleSnapshot}
          disabled={loading || streaming}
          className="p-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          title="Snapshot (100 lines)"
        >
          <Download className="h-3 w-3" />
        </button>

        {!streaming ? (
          <button
            onClick={startStream}
            disabled={loading}
            className="p-1 rounded border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
            title="Stream live"
          >
            <Play className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={stopStream}
            className="p-1 rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
            title="Stop stream"
          >
            <Square className="h-3 w-3" />
          </button>
        )}
      </div>

      {streaming && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] text-emerald-400">Streaming</span>
          <span className="text-[9px] text-zinc-500 ml-auto">{lines.length} lines</span>
        </div>
      )}

      {/* Log output */}
      <div
        ref={logRef}
        className="rounded border border-border bg-zinc-950 overflow-auto max-h-[250px] min-h-[80px] font-mono"
      >
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-20">
            <p className="text-[10px] text-zinc-600">
              {loading ? 'Fetching...' : 'Click ↓ or ▶ to load logs'}
            </p>
          </div>
        ) : (
          <div className="p-1.5">
            {lines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  'text-[9px] leading-4 px-0.5 whitespace-pre-wrap break-all',
                  line.startsWith('[ERROR]')
                    ? 'text-red-400 bg-red-500/5'
                    : 'text-zinc-400 hover:bg-zinc-900/50'
                )}
              >
                {line}
              </div>
            ))}
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
