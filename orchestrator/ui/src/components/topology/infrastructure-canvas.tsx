'use client';

import { useCallback, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { VmNode } from './nodes/vm-node';
import { EnvGroupNode } from './nodes/env-group-node';
import { VlanNode } from './nodes/vlan-node';
import { VmDetailPanel } from './vm-detail-panel';
import { TopologyLegend } from './topology-legend';
import { buildTopology } from './topology-builder';
import type { EnvironmentStatus } from '@/types/api';

const nodeTypes: NodeTypes = {
  vmNode: VmNode as unknown as NodeTypes[string],
  envGroupNode: EnvGroupNode as unknown as NodeTypes[string],
  vlanNode: VlanNode as unknown as NodeTypes[string],
};

interface InfrastructureCanvasProps {
  environments: Array<{
    name: string;
    vlan: number;
    cidr: string;
    gateway?: string;
    hosts: Record<string, { ip: string; externalIp?: string }>;
  }>;
  envStatuses: Record<string, EnvironmentStatus>;
}

export function InfrastructureCanvas({
  environments,
  envStatuses,
}: InfrastructureCanvasProps) {
  const topology = useMemo(
    () => buildTopology(environments, envStatuses),
    [environments, envStatuses]
  );

  const [nodes, , onNodesChange] = useNodesState(topology.nodes);
  const [edges, , onEdgesChange] = useEdgesState(topology.edges);
  const [selectedVm, setSelectedVm] = useState<Record<string, unknown> | null>(null);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.type === 'vmNode') {
      setSelectedVm(node.data as Record<string, unknown>);
    }
  }, []);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
        <Controls
          className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent"
        />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor={(node) => {
            if (node.type === 'envGroupNode') {
              const envName = (node.data as Record<string, string>).envName;
              if (envName === 'dev') return '#3b82f6';
              if (envName === 'qa') return '#f59e0b';
              if (envName === 'prod') return '#10b981';
            }
            if (node.type === 'vmNode') {
              const status = (node.data as Record<string, string>).status;
              if (status === 'running') return '#10b981';
              if (status === 'stopped') return '#ef4444';
              return '#71717a';
            }
            return '#3f3f46';
          }}
          maskColor="rgba(0,0,0,0.6)"
        />
      </ReactFlow>

      <TopologyLegend />

      {selectedVm && (
        <VmDetailPanel
          data={selectedVm as VmDetailPanelData}
          onClose={() => setSelectedVm(null)}
        />
      )}
    </div>
  );
}

type VmDetailPanelData = Parameters<typeof VmDetailPanel>[0]['data'];
