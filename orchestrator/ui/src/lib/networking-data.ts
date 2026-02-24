// Static networking data derived from Terraform security modules and manifest.
// This is the source of truth for the UI until dedicated networking API endpoints exist.

export interface Vlan {
  id: number;
  name: string;
  cidr: string;
  gateway: string;
  dhcpStart?: string;
  dhcpStop?: string;
  environment?: string;
  purpose: string;
}

export interface FirewallRule {
  group: string;
  direction: 'IN' | 'OUT';
  action: 'ACCEPT' | 'DROP';
  protocol: string;
  port?: string;
  source?: string;
  dest?: string;
  comment: string;
}

export interface SecurityGroup {
  name: string;
  category: 'platform' | 'application' | 'egress' | 'cluster';
  description: string;
  rules: FirewallRule[];
  appliedTo: string;
}

export interface DnsRecord {
  hostname: string;
  ip: string;
  type: 'A';
  category: 'shared' | 'vm' | 'alias';
  environment?: string;
  ttl: number;
}

export const VLANS: Vlan[] = [
  { id: 87, name: 'Management', cidr: '10.0.5.0/24', gateway: '10.0.5.1', purpose: 'Shared infrastructure (Vault, Runner, Orchestrator)' },
  { id: 100, name: 'DEV', cidr: '10.0.100.0/24', gateway: '10.0.100.1', dhcpStart: '10.0.100.100', dhcpStop: '10.0.100.199', environment: 'dev', purpose: 'Development environment VMs' },
  { id: 110, name: 'QA', cidr: '10.0.110.0/24', gateway: '10.0.110.1', dhcpStart: '10.0.110.100', dhcpStop: '10.0.110.199', environment: 'qa', purpose: 'QA environment VMs' },
  { id: 120, name: 'PROD', cidr: '10.0.120.0/24', gateway: '10.0.120.1', dhcpStart: '10.0.120.100', dhcpStop: '10.0.120.199', environment: 'prod', purpose: 'Production environment VMs' },
  { id: 7, name: 'External', cidr: '10.0.3.0/24', gateway: '10.0.3.1', purpose: 'Public ingress (client VMs only)' },
];

export const SECURITY_GROUPS: SecurityGroup[] = [
  // Platform groups
  {
    name: 'pw-ssh',
    category: 'platform',
    description: 'SSH access from management, workstation, and orchestrator',
    appliedTo: 'All VMs',
    rules: [
      { group: 'pw-ssh', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '22', source: '10.0.5.0/24', comment: 'SSH from management' },
      { group: 'pw-ssh', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '22', source: '10.0.87.0/24', comment: 'SSH from workstation' },
      { group: 'pw-ssh', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '22', source: '10.0.100.2/32', comment: 'SSH from orchestrator (dev)' },
      { group: 'pw-ssh', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '22', source: '10.0.110.2/32', comment: 'SSH from orchestrator (qa)' },
      { group: 'pw-ssh', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '22', source: '10.0.120.2/32', comment: 'SSH from orchestrator (prod)' },
    ],
  },
  {
    name: 'pw-icmp',
    category: 'platform',
    description: 'ICMP health checks from management network',
    appliedTo: 'All VMs',
    rules: [
      { group: 'pw-icmp', direction: 'IN', action: 'ACCEPT', protocol: 'ICMP', source: '10.0.5.0/24', comment: 'ICMP from management' },
    ],
  },
  {
    name: 'pw-monitoring',
    category: 'platform',
    description: 'Prometheus node exporter scraping',
    appliedTo: 'All VMs',
    rules: [
      { group: 'pw-monitoring', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '9100', source: '10.0.5.0/24', comment: 'Node exporter from management' },
    ],
  },
  {
    name: 'pw-vault',
    category: 'platform',
    description: 'Vault API access from all environments',
    appliedTo: 'Vault VM',
    rules: [
      { group: 'pw-vault', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8200', source: '10.0.5.0/24', comment: 'Vault API from management' },
      { group: 'pw-vault', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8201', source: '10.0.5.0/24', comment: 'Vault cluster from management' },
      { group: 'pw-vault', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8200', source: '10.0.100.0/24', comment: 'Vault API from dev' },
      { group: 'pw-vault', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8200', source: '10.0.110.0/24', comment: 'Vault API from qa' },
      { group: 'pw-vault', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8200', source: '10.0.120.0/24', comment: 'Vault API from prod' },
    ],
  },
  {
    name: 'pw-orchestrator',
    category: 'platform',
    description: 'Orchestrator API access',
    appliedTo: 'Orchestrator VM',
    rules: [
      { group: 'pw-orchestrator', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8500', source: '10.0.5.0/24', comment: 'Orchestrator API from management' },
    ],
  },
  // Application groups
  {
    name: 'imp-web',
    category: 'application',
    description: 'Public HTTP/HTTPS ingress',
    appliedTo: 'Client VMs (nginx)',
    rules: [
      { group: 'imp-web', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '80', source: '0.0.0.0/0', comment: 'HTTP from anywhere' },
      { group: 'imp-web', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '443', source: '0.0.0.0/0', comment: 'HTTPS from anywhere' },
    ],
  },
  ...['dev', 'qa', 'prod'].map((env): SecurityGroup => {
    const cidrMap: Record<string, string> = { dev: '10.0.100.0/24', qa: '10.0.110.0/24', prod: '10.0.120.0/24' };
    return {
      name: `imp-app-${env}`,
      category: 'application',
      description: `App server access for ${env.toUpperCase()}`,
      appliedTo: `Server VM (${env})`,
      rules: [
        { group: `imp-app-${env}`, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '2727', source: cidrMap[env], comment: `App from ${env} VLAN` },
        { group: `imp-app-${env}`, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '2727', source: '10.0.5.0/24', comment: 'App from management' },
      ],
    };
  }),
  ...['dev', 'qa', 'prod'].map((env): SecurityGroup => {
    const cidrMap: Record<string, string> = { dev: '10.0.100.0/24', qa: '10.0.110.0/24', prod: '10.0.120.0/24' };
    return {
      name: `imp-db-${env}`,
      category: 'application',
      description: `MySQL access for ${env.toUpperCase()}`,
      appliedTo: `Database VM (${env})`,
      rules: [
        { group: `imp-db-${env}`, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '3306', source: cidrMap[env], comment: `MySQL from ${env} VLAN` },
        { group: `imp-db-${env}`, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '3306', source: '10.0.5.0/24', comment: 'MySQL from management' },
      ],
    };
  }),
  ...['dev', 'qa', 'prod'].map((env): SecurityGroup => {
    const cidrMap: Record<string, string> = { dev: '10.0.100.0/24', qa: '10.0.110.0/24', prod: '10.0.120.0/24' };
    return {
      name: `imp-minio-${env}`,
      category: 'application',
      description: `MinIO access for ${env.toUpperCase()}`,
      appliedTo: `Storage VM (${env})`,
      rules: [
        { group: `imp-minio-${env}`, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '9000', source: cidrMap[env], comment: `MinIO API from ${env} VLAN` },
        { group: `imp-minio-${env}`, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '9001', source: cidrMap[env], comment: `MinIO Console from ${env} VLAN` },
      ],
    };
  }),
  // Egress groups
  {
    name: 'pw-egress-base',
    category: 'egress',
    description: 'Base outbound connectivity for all VMs',
    appliedTo: 'All VMs',
    rules: [
      { group: 'pw-egress-base', direction: 'OUT', action: 'ACCEPT', protocol: 'UDP', port: '53', comment: 'DNS resolution' },
      { group: 'pw-egress-base', direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: '53', comment: 'DNS resolution (TCP)' },
      { group: 'pw-egress-base', direction: 'OUT', action: 'ACCEPT', protocol: 'UDP', port: '123', comment: 'NTP time sync' },
      { group: 'pw-egress-base', direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: '443', comment: 'HTTPS (apt, certbot)' },
      { group: 'pw-egress-base', direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: '80', comment: 'HTTP (apt packages)' },
      { group: 'pw-egress-base', direction: 'OUT', action: 'ACCEPT', protocol: 'ICMP', comment: 'Outbound pings' },
      { group: 'pw-egress-base', direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: '22', comment: 'SSH (Ansible from orchestrator)' },
    ],
  },
  {
    name: 'imp-egress-app',
    category: 'egress',
    description: 'App server outbound to backend services',
    appliedTo: 'Server VMs',
    rules: [
      { group: 'imp-egress-app', direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: '3306', comment: 'MySQL database' },
      { group: 'imp-egress-app', direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: '9000', comment: 'MinIO API' },
      { group: 'imp-egress-app', direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: '8200', comment: 'Vault' },
    ],
  },
  {
    name: 'imp-egress-client',
    category: 'egress',
    description: 'Client outbound to app server only',
    appliedTo: 'Client VMs',
    rules: [
      { group: 'imp-egress-client', direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: '2727', comment: 'App server (proxy)' },
    ],
  },
];

const DOMAIN = 'razorwire-productions.com';

export const DNS_RECORDS: DnsRecord[] = [
  // Shared
  { hostname: `pw-vault.${DOMAIN}`, ip: '10.0.5.40', type: 'A', category: 'shared', ttl: 300 },
  { hostname: `vault.${DOMAIN}`, ip: '10.0.5.40', type: 'A', category: 'shared', ttl: 300 },
  { hostname: `pw-runner.${DOMAIN}`, ip: '10.0.5.41', type: 'A', category: 'shared', ttl: 300 },
  // Per-environment VM records
  ...(['dev', 'qa', 'prod'] as const).flatMap((env) => {
    const ipMap: Record<string, Record<string, string>> = {
      dev: { client: '10.0.100.10', server: '10.0.100.11', db: '10.0.100.12', minio: '10.0.100.13' },
      qa: { client: '10.0.110.10', server: '10.0.110.11', db: '10.0.110.12', minio: '10.0.110.13' },
      prod: { client: '10.0.120.10', server: '10.0.120.11', db: '10.0.120.12', minio: '10.0.120.13' },
    };
    const ips = ipMap[env];
    return [
      // VM records
      { hostname: `imp-client-${env}.${DOMAIN}`, ip: ips.client, type: 'A' as const, category: 'vm' as const, environment: env, ttl: 300 },
      { hostname: `imp-server-${env}.${DOMAIN}`, ip: ips.server, type: 'A' as const, category: 'vm' as const, environment: env, ttl: 300 },
      { hostname: `imp-db-${env}.${DOMAIN}`, ip: ips.db, type: 'A' as const, category: 'vm' as const, environment: env, ttl: 300 },
      { hostname: `imp-minio-${env}.${DOMAIN}`, ip: ips.minio, type: 'A' as const, category: 'vm' as const, environment: env, ttl: 300 },
      // Service aliases
      { hostname: `web.${env}.${DOMAIN}`, ip: ips.client, type: 'A' as const, category: 'alias' as const, environment: env, ttl: 300 },
      { hostname: `api.${env}.${DOMAIN}`, ip: ips.server, type: 'A' as const, category: 'alias' as const, environment: env, ttl: 300 },
      { hostname: `db.${env}.${DOMAIN}`, ip: ips.db, type: 'A' as const, category: 'alias' as const, environment: env, ttl: 300 },
      { hostname: `minio.${env}.${DOMAIN}`, ip: ips.minio, type: 'A' as const, category: 'alias' as const, environment: env, ttl: 300 },
    ];
  }),
];

export function getAllFirewallRules(): FirewallRule[] {
  return SECURITY_GROUPS.flatMap((sg) => sg.rules);
}

export function getGroupsByCategory(category: SecurityGroup['category']): SecurityGroup[] {
  return SECURITY_GROUPS.filter((sg) => sg.category === category);
}
