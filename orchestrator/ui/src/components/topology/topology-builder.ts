import type { Node, Edge } from '@xyflow/react';
import type { EnvironmentStatus, VmStatus } from '@/types/api';

// Shared infrastructure VMs on management VLAN
const SHARED_VMS = [
  { name: 'Vault', role: 'vault', ip: '10.0.5.40', services: ['HashiCorp Vault'] },
  { name: 'Runner', role: 'runner', ip: '10.0.5.41', services: ['GitHub Actions Runner'] },
  { name: 'Orchestrator', role: 'orchestrator', ip: '10.0.5.42', services: ['PW Orchestrator', 'PW Dashboard'] },
];

const MANAGEMENT_VLAN = {
  id: 87,
  cidr: '10.0.5.0/24',
  gateway: '10.0.5.1',
  label: 'Management',
};

const EXTERNAL_VLAN = {
  id: 7,
  cidr: '10.0.3.0/24',
  label: 'External',
};

// Layout constants
const ENV_GROUP_WIDTH = 320;
const ENV_GROUP_HEIGHT = 360;
const ENV_GROUP_GAP = 40;
const ENV_START_X = 80;
const ENV_START_Y = 320;
const MGMT_START_X = 80;
const MGMT_START_Y = 40;
const VM_WIDTH = 130;
const VM_HEIGHT = 70;
const VM_GAP_X = 15;
const VM_GAP_Y = 15;

export interface TopologyData {
  nodes: Node[];
  edges: Edge[];
}

const ROLE_ICONS: Record<string, string> = {
  client: 'monitor',
  server: 'server',
  database: 'database',
  storage: 'hard-drive',
  vault: 'shield',
  runner: 'play',
  orchestrator: 'cpu',
};

function getVmStatus(envStatus: EnvironmentStatus | undefined, role: string): VmStatus | undefined {
  if (!envStatus?.vms) return undefined;
  return envStatus.vms.find((vm) => vm.role === role);
}

export function buildTopology(
  environments: Array<{ name: string; vlan: number; cidr: string; gateway?: string; hosts: Record<string, { ip: string; externalIp?: string }> }>,
  envStatuses: Record<string, EnvironmentStatus>
): TopologyData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // --- Management VLAN group ---
  const mgmtGroupWidth = SHARED_VMS.length * (VM_WIDTH + VM_GAP_X) + VM_GAP_X + 40;
  nodes.push({
    id: 'vlan-mgmt',
    type: 'vlanNode',
    position: { x: MGMT_START_X, y: MGMT_START_Y },
    data: {
      label: MANAGEMENT_VLAN.label,
      vlanId: MANAGEMENT_VLAN.id,
      cidr: MANAGEMENT_VLAN.cidr,
      gateway: MANAGEMENT_VLAN.gateway,
      width: mgmtGroupWidth,
      height: 180,
    },
  });

  // Shared VMs inside management VLAN
  SHARED_VMS.forEach((vm, i) => {
    const nodeId = `shared-${vm.role}`;
    nodes.push({
      id: nodeId,
      type: 'vmNode',
      position: { x: 20 + i * (VM_WIDTH + VM_GAP_X), y: 60 },
      parentId: 'vlan-mgmt',
      extent: 'parent' as const,
      data: {
        label: vm.name,
        role: vm.role,
        ip: vm.ip,
        icon: ROLE_ICONS[vm.role] || 'server',
        status: vm.role === 'orchestrator' ? 'running' : 'unknown',
        services: vm.services,
        isShared: true,
      },
    });
  });

  // --- Environment groups ---
  environments.forEach((env, envIndex) => {
    const envId = `env-${env.name}`;
    const envX = ENV_START_X + envIndex * (ENV_GROUP_WIDTH + ENV_GROUP_GAP);
    const envY = ENV_START_Y;
    const envStatus = envStatuses[env.name];

    // Environment group node
    nodes.push({
      id: envId,
      type: 'envGroupNode',
      position: { x: envX, y: envY },
      data: {
        label: env.name.toUpperCase(),
        vlan: env.vlan,
        cidr: env.cidr,
        gateway: env.gateway,
        width: ENV_GROUP_WIDTH,
        height: ENV_GROUP_HEIGHT,
        envName: env.name,
      },
    });

    // VMs inside environment group
    const hostEntries = Object.entries(env.hosts);
    hostEntries.forEach(([role, hostConfig], hostIndex) => {
      const col = hostIndex % 2;
      const row = Math.floor(hostIndex / 2);
      const vmId = `vm-${env.name}-${role}`;
      const vmStatus = getVmStatus(envStatus, role);

      nodes.push({
        id: vmId,
        type: 'vmNode',
        position: {
          x: 15 + col * (VM_WIDTH + VM_GAP_X),
          y: 65 + row * (VM_HEIGHT + VM_GAP_Y),
        },
        parentId: envId,
        extent: 'parent' as const,
        data: {
          label: role.charAt(0).toUpperCase() + role.slice(1),
          role,
          ip: hostConfig.ip,
          externalIp: hostConfig.externalIp,
          icon: ROLE_ICONS[role] || 'server',
          status: vmStatus?.status || 'unknown',
          vmid: vmStatus?.vmid,
          node: vmStatus?.node,
          envName: env.name,
          isShared: false,
        },
      });

      // Edge: external VLAN connection for client VMs
      if (hostConfig.externalIp) {
        edges.push({
          id: `edge-ext-${env.name}-${role}`,
          source: vmId,
          target: 'vlan-external',
          type: 'default',
          animated: vmStatus?.status === 'running',
          style: { stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '5 5' },
          label: hostConfig.externalIp,
        });
      }
    });

    // Edge: management VLAN → environment VLAN
    edges.push({
      id: `edge-mgmt-${env.name}`,
      source: 'vlan-mgmt',
      target: envId,
      type: 'default',
      animated: true,
      style: { stroke: '#64748b', strokeWidth: 2 },
    });
  });

  // --- External VLAN node ---
  const totalEnvWidth = environments.length * (ENV_GROUP_WIDTH + ENV_GROUP_GAP) - ENV_GROUP_GAP;
  nodes.push({
    id: 'vlan-external',
    type: 'vlanNode',
    position: {
      x: ENV_START_X + totalEnvWidth + 60,
      y: ENV_START_Y + 60,
    },
    data: {
      label: EXTERNAL_VLAN.label,
      vlanId: EXTERNAL_VLAN.id,
      cidr: EXTERNAL_VLAN.cidr,
      width: 180,
      height: 140,
      isExternal: true,
    },
  });

  return { nodes, edges };
}
