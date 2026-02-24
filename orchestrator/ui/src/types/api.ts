// API response envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

// Environment from GET /api/_x_/apps/:app/envs
export interface Environment {
  name: string;
  vlan: number;
  cidr: string;
  gateway?: string;
  hosts: string[];
  pipeline?: PipelineConfig;
}

export interface PipelineConfig {
  autoDeployBranch?: string;
  deployOnTag?: string;
  requiresApproval?: boolean;
}

// Environment status from GET /api/_x_/apps/:app/envs/:env/status
export interface EnvironmentStatus {
  app: string;
  env: string;
  vlan: number;
  cidr: string;
  hosts: string[];
  pipeline?: PipelineConfig;
  vms: VmStatus[];
  vmsError?: string | null;
}

export interface VmStatus {
  vmid: number;
  name: string;
  node: string;
  role: string;
  status: 'running' | 'stopped' | 'unknown';
  orphaned?: boolean;
}

// App details from GET /api/_x_/apps/:app
export interface AppDetails {
  name: string;
  displayName: string;
  repo: string;
  vaultPrefix: string;
  environments: Record<string, EnvironmentManifest>;
  vmTemplate: VmTemplate;
}

export interface EnvironmentManifest {
  vlan: number;
  cidr: string;
  gateway: string;
  terraformWorkspace: string;
  hosts: Record<string, HostConfig>;
  pipeline?: PipelineConfig;
}

export interface HostConfig {
  ip: string;
  externalIp?: string;
  proxmoxNode: string;
}

export interface VmTemplate {
  roles: Record<string, string[]>;
  healthChecks: Record<string, HealthCheck>;
}

export interface HealthCheck {
  path?: string;
  port: number;
  scheme?: string;
  type?: string;
}

// Operation from GET /api/_x_/ops
export interface Operation {
  id: string;
  app: string;
  env: string;
  type: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  ref?: string;
  vars?: Record<string, unknown>;
  callback_url?: string;
  started_at?: string;
  completed_at?: string;
  output?: string;
  error?: string;
  created_at: string;
  duration_ms?: number;
  initiated_by?: string;
}

// Health status from GET /health/status
export interface HealthStatus {
  status: string;
  uptime: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  apps: number;
  version?: string;
}

// Secrets from GET /api/_x_/apps/:app/secrets or /api/_x_/infra/secrets
export interface SecretsResponse {
  path: string;
  secrets: Record<string, string>;
}

// Shared infrastructure VMs (not from API — hardcoded known infra)
export interface SharedVm {
  name: string;
  role: string;
  ip: string;
  vlan: number;
  services: string[];
}
