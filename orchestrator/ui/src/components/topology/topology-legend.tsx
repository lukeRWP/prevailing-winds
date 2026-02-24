import { cn } from '@/lib/utils';

const LEGEND_ITEMS = [
  { color: 'bg-emerald-500', label: 'Running', pulse: true },
  { color: 'bg-red-500', label: 'Stopped' },
  { color: 'bg-zinc-500', label: 'Unknown' },
];

const ENV_ITEMS = [
  { color: 'border-blue-500/60', label: 'DEV' },
  { color: 'border-amber-500/60', label: 'QA' },
  { color: 'border-emerald-500/60', label: 'PROD' },
];

export function TopologyLegend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-4 py-3 space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Legend
      </p>
      <div className="flex gap-4">
        {LEGEND_ITEMS.map(({ color, label, pulse }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className={cn('h-2 w-2 rounded-full', color, pulse && 'animate-pulse')}
            />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        {ENV_ITEMS.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={cn('h-3 w-5 rounded border-2', color, 'bg-transparent')} />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
