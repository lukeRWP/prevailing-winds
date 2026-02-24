import { cn } from '@/lib/utils';
import type { SecurityGroup } from '@/lib/networking-data';

interface FirewallRulesTableProps {
  groups: SecurityGroup[];
}

export function FirewallRulesTable({ groups }: FirewallRulesTableProps) {
  return (
    <div className="space-y-4">
      {groups.map((sg) => (
        <div key={sg.name} className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-accent/30">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-foreground font-mono">{sg.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{sg.description}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Applied to: {sg.appliedTo}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Dir</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Action</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Protocol</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Port</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Source/Dest</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sg.rules.map((rule, i) => (
                  <tr key={i} className="hover:bg-accent/20 transition-colors">
                    <td className="px-3 py-1.5">
                      <span className={cn(
                        'text-[10px] font-bold',
                        rule.direction === 'IN' ? 'text-blue-400' : 'text-purple-400'
                      )}>
                        {rule.direction}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded',
                        rule.action === 'ACCEPT' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      )}>
                        {rule.action}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">
                      {rule.protocol}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-foreground font-mono">
                      {rule.port || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">
                      {rule.direction === 'IN' ? rule.source : rule.dest || 'any'}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {rule.comment}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
