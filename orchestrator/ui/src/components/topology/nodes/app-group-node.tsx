import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface AppGroupNodeData {
  label: string;
  displayName: string;
  envCount: number;
  width: number;
  height: number;
}

function AppGroupNodeComponent({ data }: { data: AppGroupNodeData }) {
  return (
    <div
      className="rounded-2xl border-2 border-primary/30 bg-primary/[0.03] transition-colors"
      style={{ width: data.width, height: data.height }}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary/50 !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary/50 !w-3 !h-3" />

      <div className="flex items-center gap-2 px-4 py-2">
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-primary/15 text-primary">
          {data.displayName || data.label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {data.envCount} environment{data.envCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

export const AppGroupNode = memo(AppGroupNodeComponent);
