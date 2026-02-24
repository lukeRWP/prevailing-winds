/**
 * Change Engine — computes cascading effects from proposed config changes.
 *
 * Given a set of proposed changes to an app manifest, derives:
 *   - Direct changes (what the user explicitly changed)
 *   - Suggested changes (cascading effects the system recommends)
 *   - Warnings (potential issues or risks)
 *
 * Targets: manifest fields, terraform vars, firewall rules, DNS records
 */

const { v4: uuidv4 } = require('uuid');
const appRegistry = require('./appRegistry');
const config = require('../config');

/**
 * Compute a change plan from proposed changes.
 *
 * @param {string} appName - The app to compute changes for
 * @param {Array<{target: string, value: any}>} proposedChanges - User's proposed changes
 * @returns {{ changes: Change[], warnings: Warning[], dryRunAvailable: boolean }}
 */
function computePlan(appName, proposedChanges) {
  const app = appRegistry.get(appName);
  if (!app) throw new Error(`App '${appName}' not found`);

  const changes = [];
  const warnings = [];

  for (const proposed of proposedChanges) {
    const { target, value } = proposed;
    const previous = resolveField(app, target);

    // Add the user's direct change
    const change = {
      id: uuidv4(),
      source: 'user',
      target,
      description: describeChange(target, previous, value),
      value,
      previous,
      executionMethod: classifyExecution(target),
      risk: classifyRisk(target),
    };
    changes.push(change);

    // Compute cascading suggestions
    const cascading = computeCascading(app, target, value, previous);
    changes.push(...cascading.suggestions);
    warnings.push(...cascading.warnings);
  }

  // Check for cross-change conflicts
  const targetSet = new Set(changes.map((c) => c.target));
  if (targetSet.size < changes.length) {
    warnings.push({
      type: 'conflict',
      message: 'Multiple changes target the same field — later changes will override earlier ones.',
    });
  }

  return {
    changes,
    warnings,
    dryRunAvailable: changes.some((c) => c.executionMethod === 'terraform'),
  };
}

/**
 * Compute cascading suggestions and warnings for a single change.
 */
function computeCascading(app, target, value, previous) {
  const suggestions = [];
  const warnings = [];
  const envs = app.environments || {};
  const domain = config.infra.domain;

  // --- CIDR changed → update all host IPs, gateway, firewall source CIDRs ---
  const cidrMatch = target.match(/^environments\.(\w+)\.cidr$/);
  if (cidrMatch) {
    const envName = cidrMatch[1];
    const env = envs[envName];
    if (env) {
      const newPrefix = value.replace(/\.\d+\/\d+$/, '');
      const oldPrefix = (previous || '').replace(/\.\d+\/\d+$/, '');

      // Suggest gateway update
      if (env.gateway && oldPrefix) {
        const newGateway = env.gateway.replace(oldPrefix, newPrefix);
        suggestions.push(makeSuggestion(
          `environments.${envName}.gateway`,
          env.gateway, newGateway,
          `Update gateway to match new CIDR`,
          'manifest', 'low'
        ));
      }

      // Suggest host IP updates
      const hosts = env.hosts || {};
      for (const [role, hostConfig] of Object.entries(hosts)) {
        if (hostConfig.ip && oldPrefix) {
          const newIp = hostConfig.ip.replace(oldPrefix, newPrefix);
          suggestions.push(makeSuggestion(
            `environments.${envName}.hosts.${role}.ip`,
            hostConfig.ip, newIp,
            `Update ${role} IP to match new CIDR`,
            'manifest', 'low'
          ));
        }
      }

      warnings.push({
        type: 'firewall',
        message: `Changing CIDR for ${envName} will require updating firewall rules that reference ${previous}.`,
      });
      warnings.push({
        type: 'dns',
        message: `DNS records for ${envName} VMs will need updating if host IPs change.`,
      });
    }
  }

  // --- Host IP changed → update DNS ---
  const hostIpMatch = target.match(/^environments\.(\w+)\.hosts\.(\w+)\.ip$/);
  if (hostIpMatch) {
    const [, envName, role] = hostIpMatch;
    const roleAlias = { client: 'web', server: 'api', database: 'db', storage: 'minio' };
    const roleDns = { client: 'client', server: 'app', database: 'db', storage: 'minio' };

    // VM DNS record
    suggestions.push(makeSuggestion(
      `dns.${app.name}-${roleDns[role] || role}-${envName}.${domain}`,
      previous, value,
      `Update DNS A record for ${role} VM`,
      'dns', 'low'
    ));

    // Service alias
    if (roleAlias[role]) {
      suggestions.push(makeSuggestion(
        `dns.${roleAlias[role]}.${envName}.${domain}`,
        previous, value,
        `Update DNS alias for ${roleAlias[role]}.${envName}`,
        'dns', 'low'
      ));
    }

    warnings.push({
      type: 'firewall',
      message: `Firewall rules referencing IP ${previous} may need updating.`,
    });
  }

  // --- VLAN changed → warn about network reconfiguration ---
  const vlanMatch = target.match(/^environments\.(\w+)\.vlan$/);
  if (vlanMatch) {
    warnings.push({
      type: 'infrastructure',
      message: `Changing VLAN tag requires Proxmox network interface reconfiguration. VMs will lose connectivity during the change.`,
    });
  }

  // --- Pipeline config changed → warn about CI/CD impact ---
  const pipelineMatch = target.match(/^environments\.(\w+)\.pipeline\./);
  if (pipelineMatch) {
    const envName = pipelineMatch[1];
    warnings.push({
      type: 'pipeline',
      message: `Pipeline changes for ${envName} will take effect on the next CI/CD trigger.`,
    });
  }

  // --- Environment removed → cascade warnings ---
  const envRemoveMatch = target.match(/^environments\.(\w+)$/) && value === null;
  if (envRemoveMatch) {
    const envName = target.match(/^environments\.(\w+)$/)[1];
    warnings.push({
      type: 'data-loss',
      message: `Removing environment ${envName} will destroy all VMs, data, and infrastructure. This is IRREVERSIBLE. Back up databases first.`,
    });
  }

  // --- New environment added → suggest VLAN, CIDR, hosts ---
  const newEnvMatch = target.match(/^environments\.(\w+)$/) && value && typeof value === 'object' && !previous;
  if (newEnvMatch) {
    const envName = target.match(/^environments\.(\w+)$/)[1];
    const existingVlans = Object.values(envs).map((e) => e.vlan);
    const maxVlan = Math.max(0, ...existingVlans);

    if (!value.vlan) {
      const suggestedVlan = maxVlan + 10;
      suggestions.push(makeSuggestion(
        `environments.${envName}.vlan`, undefined, suggestedVlan,
        `Suggested VLAN tag (next available)`,
        'manifest', 'low'
      ));
    }

    if (!value.cidr) {
      const suggestedOctet = (maxVlan + 10) > 255 ? 200 : maxVlan + 10;
      suggestions.push(makeSuggestion(
        `environments.${envName}.cidr`, undefined, `10.0.${suggestedOctet}.0/24`,
        `Suggested CIDR block`,
        'manifest', 'low'
      ));
    }

    // Suggest hosts based on vmTemplate roles
    const roles = Object.keys(app.vmTemplate?.roles || {});
    if (roles.length > 0 && !value.hosts) {
      warnings.push({
        type: 'suggestion',
        message: `New environment ${envName} needs host definitions for roles: ${roles.join(', ')}. Configure hosts with IP addresses after setting CIDR.`,
      });
    }
  }

  // --- Health check port changed → suggest firewall update ---
  const hcPortMatch = target.match(/^vmTemplate\.healthChecks\.(\w+)\.port$/);
  if (hcPortMatch) {
    const role = hcPortMatch[1];
    warnings.push({
      type: 'firewall',
      message: `Changing health check port for ${role} requires updating firewall rules in all environments.`,
    });
  }

  return { suggestions, warnings };
}

/**
 * Resolve a dotted field path against an app manifest.
 */
function resolveField(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Set a dotted field path on an object (mutates).
 */
function setField(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current)) current[parts[i]] = {};
    current = current[parts[i]];
  }
  if (value === null) {
    delete current[parts[parts.length - 1]];
  } else {
    current[parts[parts.length - 1]] = value;
  }
}

/**
 * Apply a set of changes to a manifest (deep clone first).
 */
function applyChangesToManifest(manifest, changes) {
  const clone = JSON.parse(JSON.stringify(manifest));
  for (const change of changes) {
    // Only apply manifest-level changes (skip dns, firewall references)
    if (!change.target.startsWith('dns.') && !change.target.startsWith('firewall.')) {
      setField(clone, change.target, change.value);
    }
  }
  return clone;
}

function makeSuggestion(target, previous, value, description, executionMethod, risk) {
  return {
    id: uuidv4(),
    source: 'suggested',
    target,
    description,
    value,
    previous,
    executionMethod,
    risk,
  };
}

function describeChange(target, previous, value) {
  if (value === null) return `Remove ${target}`;
  if (previous === undefined) return `Set ${target} to ${JSON.stringify(value)}`;
  return `Change ${target}: ${JSON.stringify(previous)} → ${JSON.stringify(value)}`;
}

function classifyExecution(target) {
  if (target.startsWith('environments.') && (target.includes('.vlan') || target.includes('.cidr'))) return 'terraform';
  if (target.includes('.hosts.') && target.includes('.proxmoxNode')) return 'terraform';
  if (target.startsWith('vmTemplate.')) return 'terraform';
  return 'manifest';
}

function classifyRisk(target) {
  if (target.match(/^environments\.\w+$/) && !target.includes('.')) return 'high'; // env add/remove
  if (target.includes('.vlan') || target.includes('.cidr')) return 'medium';
  if (target.includes('pipeline')) return 'low';
  return 'low';
}

module.exports = { computePlan, applyChangesToManifest, resolveField, setField };
