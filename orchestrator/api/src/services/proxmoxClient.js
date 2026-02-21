const https = require('https');
const logger = require('../utils/logger');
const vault = require('./vault');

const CONTEXT = 'proxmox';

// Map manifest role names to Terraform/Proxmox VM name keys
const ROLE_KEY_MAP = {
  database: 'db',
  storage: 'minio',
  client: 'client',
  server: 'server',
};

const agent = new https.Agent({ rejectUnauthorized: false });

let cachedCreds = null;

async function getCredentials() {
  if (cachedCreds) return cachedCreds;

  const secrets = await vault.readSecret('secret/data/pw/infra');
  if (!secrets || !secrets.proxmox_api_url || !secrets.proxmox_api_token) {
    throw new Error('Proxmox API credentials not found in Vault');
  }

  cachedCreds = {
    apiUrl: secrets.proxmox_api_url.replace(/\/+$/, ''),
    apiToken: secrets.proxmox_api_token,
  };
  return cachedCreds;
}

async function apiRequest(method, apiPath, body = null) {
  const { apiUrl, apiToken } = await getCredentials();
  const url = new URL(`${apiUrl}${apiPath}`);

  const options = {
    hostname: url.hostname,
    port: url.port || 8006,
    path: url.pathname + url.search,
    method,
    agent,
    headers: {
      'Authorization': `PVEAPIToken=${apiToken}`,
      'Content-Type': 'application/json',
    },
  };

  const payload = body ? JSON.stringify(body) : null;
  if (payload) {
    options.headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed.data !== undefined ? parsed.data : parsed);
          } else {
            const msg = parsed.errors
              ? JSON.stringify(parsed.errors)
              : (parsed.message || `HTTP ${res.statusCode}`);
            reject(new Error(`Proxmox API ${method} ${apiPath}: ${msg}`));
          }
        } catch {
          reject(new Error(`Proxmox API ${method} ${apiPath}: non-JSON response (${res.statusCode})`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Proxmox API request failed: ${err.message}`)));
    if (payload) req.write(payload);
    req.end();
  });
}

async function listVMs(node) {
  return apiRequest('GET', `/nodes/${node}/qemu`);
}

async function listHAResources() {
  return apiRequest('GET', '/cluster/ha/resources');
}

async function removeHAResource(sid) {
  logger.info(CONTEXT, `Removing HA resource: ${sid}`);
  return apiRequest('DELETE', `/cluster/ha/resources/${encodeURIComponent(sid)}`);
}

async function stopVM(node, vmid) {
  logger.info(CONTEXT, `Stopping VM ${vmid} on ${node}`);
  return apiRequest('POST', `/nodes/${node}/qemu/${vmid}/status/stop`);
}

async function destroyVM(node, vmid) {
  logger.info(CONTEXT, `Destroying VM ${vmid} on ${node}`);
  return apiRequest('DELETE', `/nodes/${node}/qemu/${vmid}?purge=1&destroy-unreferenced-disks=1`);
}

async function waitForStatus(node, vmid, targetStatus, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const vms = await listVMs(node);
    const vm = vms.find((v) => v.vmid === vmid);
    if (!vm) return;
    if (vm.status === targetStatus) return;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`VM ${vmid} did not reach '${targetStatus}' within ${maxWaitMs / 1000}s`);
}

/**
 * Find VMs belonging to an app environment by name convention.
 * Names: {appName}-{roleKey}-{envName} (e.g., imp-db-dev, imp-server-dev)
 */
async function findEnvironmentVMs(appName, envName, envConfig) {
  const hosts = envConfig.hosts || {};
  const nodeSet = new Set();
  const expectedNames = new Map();

  for (const [role, hostCfg] of Object.entries(hosts)) {
    const roleKey = ROLE_KEY_MAP[role] || role;
    const vmName = `${appName}-${roleKey}-${envName}`;
    expectedNames.set(vmName, { role, roleKey, node: hostCfg.proxmoxNode });
    if (hostCfg.proxmoxNode) nodeSet.add(hostCfg.proxmoxNode);
  }

  const found = [];
  for (const node of nodeSet) {
    const vms = await listVMs(node);
    for (const vm of vms) {
      const match = expectedNames.get(vm.name);
      if (match) {
        found.push({
          vmid: vm.vmid,
          name: vm.name,
          node,
          role: match.role,
          status: vm.status,
          orphaned: true,
        });
      }
    }
  }

  return found;
}

/**
 * Destroy all VMs for an app environment.
 * Handles: HA removal → stop → wait → destroy.
 */
async function destroyEnvironmentVMs(appName, envName, envConfig) {
  const vms = await findEnvironmentVMs(appName, envName, envConfig);
  const destroyed = [];
  const skipped = [];

  if (vms.length === 0) {
    logger.info(CONTEXT, `No VMs found for ${appName}:${envName}`);
    return { destroyed, skipped };
  }

  logger.info(CONTEXT, `Found ${vms.length} VMs for ${appName}:${envName}: ${vms.map((v) => `${v.name}(${v.vmid})`).join(', ')}`);

  // Fetch HA resources once
  let haByVmid = new Map();
  try {
    const haResources = await listHAResources();
    for (const ha of haResources) {
      const match = ha.sid?.match(/^vm:(\d+)$/);
      if (match) haByVmid.set(parseInt(match[1], 10), ha.sid);
    }
  } catch (err) {
    logger.warn(CONTEXT, `Could not list HA resources: ${err.message}`);
  }

  for (const vm of vms) {
    try {
      // Remove HA if present
      const haSid = haByVmid.get(vm.vmid);
      if (haSid) {
        await removeHAResource(haSid);
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Stop if running
      if (vm.status === 'running') {
        await stopVM(vm.node, vm.vmid);
        await waitForStatus(vm.node, vm.vmid, 'stopped');
      }

      // Destroy
      await destroyVM(vm.node, vm.vmid);
      destroyed.push(vm.name);
      logger.info(CONTEXT, `Destroyed ${vm.name} (vmid: ${vm.vmid})`);
    } catch (err) {
      logger.error(CONTEXT, `Failed to destroy ${vm.name}: ${err.message}`);
      skipped.push(vm.name);
    }
  }

  return { destroyed, skipped };
}

module.exports = {
  listVMs,
  findEnvironmentVMs,
  destroyEnvironmentVMs,
};
