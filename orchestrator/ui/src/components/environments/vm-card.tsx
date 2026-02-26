import { Monitor, Server, Database, HardDrive, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_ICONS: Record<string, React.ElementType> = {
  client: Monitor,
  server: Server,
  database: Database,
  storage: HardDrive,
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  running: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  stopped: { bg: 'bg-red-500/20', text: 'text-red-400' },
  unknown: { bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
};

interface VmCardProps {
  role: string;
  ip: string;
  externalIp?: string;
  status: string;
  vmid?: number;
  proxmoxNode?: string;
  services?: string[];
  onMigrate?: (vmid: number, currentNode: string) => void;
}

export function VmCard({ role, ip, externalIp, status, vmid, proxmoxNode, services, onMigrate }: VmCardProps) {
  const Icon = ROLE_ICONS[role] || Server;
  const badge = STATUS_BADGE[status] || STATUS_BADGE.unknown;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground capitalize">{role}</span>
        </div>
        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', badge.bg, badge.text)}>
          {status}
        </span>
      </div>

      <div className="mt-3 space-y-1">
        <DetailLine label="IP" value={ip} mono />
        {externalIp && <DetailLine label="External" value={externalIp} mono />}
        {vmid !== undefined && <DetailLine label="VM ID" value={String(vmid)} mono />}
        {proxmoxNode && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Node</span>
            <div className="flex items-center gap-1.5">
              <span className="text-foreground">{proxmoxNode}</span>
              {onMigrate && vmid !== undefined && (
                <button
                  onClick={() => onMigrate(vmid, proxmoxNode)}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                  title="Migrate to another node"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {services && services.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {services.map((svc) => (
            <span key={svc} className="text-[10px] bg-accent/50 rounded px-1.5 py-0.5 text-muted-foreground">
              {svc}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-foreground', mono && 'font-mono')}>{value}</span>
    </div>
  );
}
