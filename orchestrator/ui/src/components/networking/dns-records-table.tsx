import { cn } from '@/lib/utils';
import type { DnsRecord } from '@/lib/networking-data';

const CATEGORY_BADGE: Record<string, { bg: string; text: string }> = {
  shared: { bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
  vm: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  alias: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
};

interface DnsRecordsTableProps {
  records: DnsRecord[];
}

export function DnsRecordsTable({ records }: DnsRecordsTableProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Hostname</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Type</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">IP</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Category</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Env</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">TTL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.map((record) => {
              const badge = CATEGORY_BADGE[record.category] || CATEGORY_BADGE.shared;
              return (
                <tr key={record.hostname} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-2 text-xs text-foreground font-mono">{record.hostname}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{record.type}</td>
                  <td className="px-4 py-2 text-xs text-foreground font-mono">{record.ip}</td>
                  <td className="px-4 py-2">
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', badge.bg, badge.text)}>
                      {record.category}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {record.environment?.toUpperCase() || '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{record.ttl}s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
