import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Globe, Network } from 'lucide-react';

interface VlanNodeData {
  label: string;
  vlanId: number;
  cidr: string;
  gateway?: string;
  width: number;
  height: number;
  isExternal?: boolean;
}

function VlanNodeComponent({ data }: { data: VlanNodeData }) {
  const Icon = data.isExternal ? Globe : Network;

  return (
    <div
      className="rounded-xl border-2 border-dashed border-zinc-600/50 bg-zinc-900/30"
      style={{ width: data.width, height: data.height }}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !w-2.5 !h-2.5" />

      <div className="flex items-center gap-2 px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">{data.label}</span>
        <span className="text-[10px] text-muted-foreground font-mono ml-auto">
          VLAN {data.vlanId}
        </span>
      </div>
      <div className="px-3 text-[10px] text-muted-foreground font-mono">
        {data.cidr}
        {data.gateway && ` · gw ${data.gateway}`}
      </div>
    </div>
  );
}

export const VlanNode = memo(VlanNodeComponent);
