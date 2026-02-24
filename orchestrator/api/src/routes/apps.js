const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { Router } = require('express');
const { success, error } = require('../utils/response');
const config = require('../config');
const logger = require('../utils/logger');
const appRegistry = require('../services/appRegistry');
const changeEngine = require('../services/changeEngine');
const changeHistory = require('../services/changeHistory');

const router = Router();

// Auth introspection — returns the token's scope and available apps
router.get('/api/_x_/auth/whoami', (req, res) => {
  let availableApps;
  if (req.authRole === 'admin') {
    availableApps = appRegistry.getAll();
  } else {
    const app = appRegistry.get(req.authorizedApp);
    availableApps = app ? [{
      name: app.name,
      displayName: app.displayName,
      repo: app.repo,
      infraPath: app.infraPath,
      environments: Object.keys(app.environments || {})
    }] : [];
  }

  return success(res, {
    role: req.authRole,
    authorizedApp: req.authorizedApp || null,
    availableApps,
  });
});

router.get('/api/_x_/apps', (req, res) => {
  const apps = appRegistry.getAll();
  return success(res, apps, `Found ${apps.length} app(s)`);
});

router.get('/api/_x_/apps/:app', (req, res) => {
  const app = appRegistry.get(req.params.app);
  if (!app) return error(res, `App '${req.params.app}' not found`, 404);

  return success(res, {
    name: app.name,
    displayName: app.displayName,
    repo: app.repo,
    infraPath: app.infraPath,
    vaultPrefix: app.vaultPrefix,
    vmTemplate: app.vmTemplate,
    environments: app.environments
  });
});

router.get('/api/_x_/apps/:app/envs', (req, res) => {
  const app = appRegistry.get(req.params.app);
  if (!app) return error(res, `App '${req.params.app}' not found`, 404);

  const envs = app.environments || {};
  let entries = Object.entries(envs);

  if (req.query.pipeline === 'true') {
    entries = entries.filter(([, cfg]) => cfg.pipeline);
  }

  const result = entries.map(([name, cfg]) => {
    const entry = {
      name,
      vlan: cfg.vlan,
      cidr: cfg.cidr,
      hosts: Object.keys(cfg.hosts || {}),
      pipeline: cfg.pipeline || null
    };
    // Flatten pipeline config for CI matrix consumption
    if (req.query.pipeline === 'true' && cfg.pipeline) {
      entry.autoDeployBranch = cfg.pipeline.autoDeployBranch || null;
      entry.deployOnTag = cfg.pipeline.deployOnTag || null;
      entry.requiresApproval = cfg.pipeline.requiresApproval || false;
    }
    return entry;
  });

  return success(res, result, `Found ${result.length} environment(s)`);
});

// Derive networking data from app manifest
router.get('/api/_x_/apps/:app/networking', (req, res) => {
  const app = appRegistry.get(req.params.app);
  if (!app) return error(res, `App '${req.params.app}' not found`, 404);

  const domain = config.infra.domain;
  const envs = app.environments || {};
  const envNames = Object.keys(envs);
  const healthChecks = app.vmTemplate?.healthChecks || {};
  const roles = Object.keys(app.vmTemplate?.roles || {});
  const managementCidr = '10.0.5.0/24';
  const workstationCidr = '10.0.87.0/24';

  // Role name → security group name segment
  const roleGroupName = { client: 'web', server: 'app', database: 'db', storage: 'minio' };
  // Role name → service alias for DNS
  const roleAlias = { client: 'web', server: 'api', database: 'db', storage: 'minio' };

  // --- VLANs ---
  const vlans = [
    { id: 87, name: 'Management', cidr: managementCidr, gateway: '10.0.5.1', purpose: 'Shared infrastructure (Vault, Runner, Orchestrator)' },
    { id: 7, name: 'External', cidr: '10.0.3.0/24', gateway: '10.0.3.1', purpose: 'Public ingress (client VMs only)' },
    ...envNames.map(name => {
      const env = envs[name];
      return {
        id: env.vlan,
        name: name.toUpperCase(),
        cidr: env.cidr,
        gateway: env.gateway,
        environment: name,
        purpose: `${app.displayName || app.name} ${name} environment VMs`,
      };
    }),
  ];

  // --- Security Groups ---
  // Platform groups (shared infrastructure, not app-specific)
  const platformGroups = [
    {
      name: 'pw-ssh', category: 'platform',
      description: 'SSH access from management, workstation, and orchestrator',
      appliedTo: 'All VMs',
      rules: [
        { group: 'pw-ssh', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '22', source: managementCidr, comment: 'SSH from management' },
        { group: 'pw-ssh', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '22', source: workstationCidr, comment: 'SSH from workstation' },
      ],
    },
    {
      name: 'pw-icmp', category: 'platform',
      description: 'ICMP health checks from management network',
      appliedTo: 'All VMs',
      rules: [
        { group: 'pw-icmp', direction: 'IN', action: 'ACCEPT', protocol: 'ICMP', source: managementCidr, comment: 'ICMP from management' },
      ],
    },
    {
      name: 'pw-monitoring', category: 'platform',
      description: 'Prometheus node exporter scraping',
      appliedTo: 'All VMs',
      rules: [
        { group: 'pw-monitoring', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '9100', source: managementCidr, comment: 'Node exporter from management' },
      ],
    },
    {
      name: 'pw-vault', category: 'platform',
      description: 'Vault API access from all environments',
      appliedTo: 'Vault VM',
      rules: [
        { group: 'pw-vault', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8200', source: managementCidr, comment: 'Vault API from management' },
        { group: 'pw-vault', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8201', source: managementCidr, comment: 'Vault cluster from management' },
        ...envNames.map(name => ({
          group: 'pw-vault', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8200',
          source: envs[name].cidr, comment: `Vault API from ${name}`,
        })),
      ],
    },
    {
      name: 'pw-orchestrator', category: 'platform',
      description: 'Orchestrator API access',
      appliedTo: 'Orchestrator VM',
      rules: [
        { group: 'pw-orchestrator', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '8500', source: managementCidr, comment: 'Orchestrator API from management' },
      ],
    },
  ];

  // Application groups (derived from manifest vmTemplate + healthChecks)
  const applicationGroups = [];
  for (const role of roles) {
    const hc = healthChecks[role];
    if (!hc) continue;

    const groupSegment = roleGroupName[role] || role;

    if (role === 'client') {
      // Client gets public HTTP/HTTPS ingress
      applicationGroups.push({
        name: `${app.name}-web`, category: 'application',
        description: 'Public HTTP/HTTPS ingress',
        appliedTo: 'Client VMs (nginx)',
        rules: [
          { group: `${app.name}-web`, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '80', source: '0.0.0.0/0', comment: 'HTTP from anywhere' },
          { group: `${app.name}-web`, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: '443', source: '0.0.0.0/0', comment: 'HTTPS from anywhere' },
        ],
      });
    } else {
      // Other roles get per-env access on their health check port
      for (const envName of envNames) {
        const env = envs[envName];
        const groupName = `${app.name}-${groupSegment}-${envName}`;
        const port = String(hc.port);
        const rules = [
          { group: groupName, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port, source: env.cidr, comment: `${groupSegment} from ${envName} VLAN` },
          { group: groupName, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port, source: managementCidr, comment: `${groupSegment} from management` },
        ];
        // Storage (MinIO) also needs console port (API port + 1)
        if (role === 'storage') {
          const consolePort = String(hc.port + 1);
          rules.push(
            { group: groupName, direction: 'IN', action: 'ACCEPT', protocol: 'TCP', port: consolePort, source: env.cidr, comment: `MinIO Console from ${envName} VLAN` },
          );
        }
        applicationGroups.push({
          name: groupName, category: 'application',
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} access for ${envName.toUpperCase()}`,
          appliedTo: `${role.charAt(0).toUpperCase() + role.slice(1)} VM (${envName})`,
          rules,
        });
      }
    }
  }

  // Egress groups
  const egressGroups = [
    {
      name: 'pw-egress-base', category: 'egress',
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
  ];

  // Server egress to backend services
  const serverHc = healthChecks.server;
  const dbHc = healthChecks.database;
  const storageHc = healthChecks.storage;
  if (serverHc) {
    const rules = [];
    if (dbHc) rules.push({ group: `${app.name}-egress-app`, direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: String(dbHc.port), comment: 'Database' });
    if (storageHc) rules.push({ group: `${app.name}-egress-app`, direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: String(storageHc.port), comment: 'Storage API' });
    rules.push({ group: `${app.name}-egress-app`, direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: '8200', comment: 'Vault' });
    egressGroups.push({
      name: `${app.name}-egress-app`, category: 'egress',
      description: 'App server outbound to backend services',
      appliedTo: 'Server VMs',
      rules,
    });
  }

  // Client egress to app server
  if (serverHc) {
    egressGroups.push({
      name: `${app.name}-egress-client`, category: 'egress',
      description: 'Client outbound to app server only',
      appliedTo: 'Client VMs',
      rules: [
        { group: `${app.name}-egress-client`, direction: 'OUT', action: 'ACCEPT', protocol: 'TCP', port: String(serverHc.port), comment: 'App server (proxy)' },
      ],
    });
  }

  // --- DNS Records ---
  const dnsRecords = [
    // Shared platform records
    { hostname: `pw-vault.${domain}`, ip: '10.0.5.40', type: 'A', category: 'shared', ttl: 300 },
    { hostname: `vault.${domain}`, ip: '10.0.5.40', type: 'A', category: 'shared', ttl: 300 },
    { hostname: `pw-runner.${domain}`, ip: '10.0.5.41', type: 'A', category: 'shared', ttl: 300 },
  ];

  // Per-environment records derived from manifest hosts
  for (const envName of envNames) {
    const hosts = envs[envName].hosts || {};
    for (const [role, hostConfig] of Object.entries(hosts)) {
      const roleName = roleGroupName[role] || role;
      // VM A record
      dnsRecords.push({
        hostname: `${app.name}-${roleName === 'web' ? 'client' : roleName}-${envName}.${domain}`,
        ip: hostConfig.ip,
        type: 'A',
        category: 'vm',
        environment: envName,
        ttl: 300,
      });
      // Service alias
      const alias = roleAlias[role];
      if (alias) {
        dnsRecords.push({
          hostname: `${alias}.${envName}.${domain}`,
          ip: hostConfig.ip,
          type: 'A',
          category: 'alias',
          environment: envName,
          ttl: 300,
        });
      }
    }
  }

  const securityGroups = [...platformGroups, ...applicationGroups, ...egressGroups];

  return success(res, { vlans, securityGroups, dnsRecords });
});

// Register or update an app manifest (admin-only)
router.put('/api/_u_/apps/:app/manifest', (req, res) => {
  const { app: appName } = req.params;
  const { yaml: rawYaml } = req.body;

  if (!rawYaml) {
    return error(res, 'Request body must include "yaml" field with raw app.yml content', 400);
  }

  // Parse and validate
  let manifest;
  try {
    manifest = yaml.load(rawYaml);
  } catch (e) {
    return error(res, `Invalid YAML: ${e.message}`, 400);
  }

  if (!manifest || !manifest.name) {
    return error(res, 'Manifest must include a "name" field', 400);
  }

  if (manifest.name !== appName) {
    return error(res, `Manifest name "${manifest.name}" does not match URL param "${appName}"`, 400);
  }

  // Write to apps directory
  const appDir = path.join(config.appsDir, appName);
  fs.mkdirSync(appDir, { recursive: true });

  const manifestPath = path.join(appDir, 'app.yml');
  fs.writeFileSync(manifestPath, rawYaml, 'utf8');

  // Reload registry
  appRegistry.loadApps();

  logger.info('apps', `Registered/updated manifest for app "${appName}"`);
  return success(res, { app: appName, path: manifestPath }, `App "${appName}" manifest registered`);
});

// --- Change Engine Endpoints ---

// Compute a change plan (preview cascading effects)
router.post('/api/_y_/apps/:app/changes/plan', (req, res) => {
  const { changes } = req.body;
  if (!changes || !Array.isArray(changes)) {
    return error(res, 'Request body must include "changes" array', 400);
  }

  try {
    const plan = changeEngine.computePlan(req.params.app, changes);
    return success(res, plan);
  } catch (err) {
    return error(res, err.message, 400);
  }
});

// Apply changes to the manifest
router.post('/api/_y_/apps/:app/changes/apply', (req, res) => {
  const { changes, dryRun } = req.body;
  if (!changes || !Array.isArray(changes)) {
    return error(res, 'Request body must include "changes" array', 400);
  }

  const appName = req.params.app;
  const app = appRegistry.get(appName);
  if (!app) return error(res, `App '${appName}' not found`, 404);

  try {
    // Snapshot current manifest
    const appDir = path.join(config.appsDir, appName);
    const manifestPath = path.join(appDir, 'app.yml');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');

    // Apply changes to produce new manifest
    const newManifest = changeEngine.applyChangesToManifest(app, changes);

    if (dryRun) {
      // Return the diff without writing
      return success(res, {
        dryRun: true,
        manifestBefore: yaml.dump(yaml.load(manifestBefore)),
        manifestAfter: yaml.dump(newManifest),
        changesApplied: changes.length,
      });
    }

    // Write the new manifest
    const newYaml = yaml.dump(newManifest, { lineWidth: -1 });
    fs.writeFileSync(manifestPath, newYaml, 'utf8');

    // Record in change history
    const changeSetId = changeHistory.record(
      appName, changes, manifestBefore, newYaml,
      req.authRole === 'admin' ? 'admin' : `app:${req.authorizedApp}`
    );

    // Reload registry
    appRegistry.loadApps();

    logger.info('apps', `Applied ${changes.length} changes to ${appName} (change set: ${changeSetId})`);
    return success(res, {
      changeSetId,
      changesApplied: changes.length,
    }, `Applied ${changes.length} change(s) to ${appName}`);
  } catch (err) {
    logger.error('apps', `Failed to apply changes to ${appName}: ${err.message}`);
    return error(res, err.message, 500);
  }
});

// List change history for an app
router.get('/api/_x_/apps/:app/changes/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  try {
    const history = changeHistory.list(req.params.app, limit);
    return success(res, history);
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// Get a specific change set
router.get('/api/_x_/apps/:app/changes/:id', (req, res) => {
  const changeSet = changeHistory.get(req.params.id);
  if (!changeSet) return error(res, 'Change set not found', 404);
  if (changeSet.app !== req.params.app) return error(res, 'Change set does not belong to this app', 404);
  return success(res, changeSet);
});

// Rollback a change set
router.post('/api/_y_/apps/:app/changes/:id/rollback', (req, res) => {
  try {
    const rollbackId = changeHistory.rollback(req.params.id);
    return success(res, { rollbackId }, 'Change set rolled back successfully');
  } catch (err) {
    return error(res, err.message, 400);
  }
});

module.exports = router;
