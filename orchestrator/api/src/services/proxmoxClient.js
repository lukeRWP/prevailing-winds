const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');
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

/**
 * Ensure the cloud-init base snippet exists on the target Proxmox node.
 * Uses SSH to write the file since the Proxmox API doesn't support snippet uploads.
 */
async function ensureCloudInitSnippet(targetNode, storage = 'local') {
  const { spawn } = require('child_process');

  const { apiUrl } = await getCredentials();
  const proxmoxHost = new URL(apiUrl).hostname;
  const templatePath = path.join(__dirname, '../../..', 'terraform/templates/cloud-init-base.yml');
  const content = fs.readFileSync(templatePath, 'utf-8');
  const snippetDir = storage === 'local' ? '/var/lib/vz/snippets' : `/mnt/pve/${storage}/snippets`;
  const remotePath = `${snippetDir}/pw-cloud-init-base.yml`;
  const sshKeyPath = path.join(__dirname, '../../..', '.ssh/ansible_key');

  logger.info(CONTEXT, `Writing cloud-init snippet to ${proxmoxHost}:${remotePath} via SSH`);

  const sshArgs = [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=5',
    '-i', sshKeyPath,
    `root@${proxmoxHost}`,
    `mkdir -p ${snippetDir} && cat > ${remotePath}`,
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn('ssh', sshArgs, { timeout: 15000 });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code === 0) {
        if (stderr) logger.warn(CONTEXT, `SSH stderr: ${stderr}`);
        resolve();
      } else {
        reject(new Error(`SSH snippet upload failed (code ${code}): ${stderr}`));
      }
    });
    proc.on('error', (err) => reject(err));
    proc.stdin.write(content);
    proc.stdin.end();
  });

  logger.info(CONTEXT, `Cloud-init snippet written successfully`);
}

/**
 * Execute a command inside a VM via the QEMU guest agent.
 * Returns { exitcode, outData, errData }.
 */
async function guestExec(node, vmid, command, inputData = '') {
  const body = { command: '/bin/bash' };
  if (inputData) body['input-data'] = inputData + '\n';

  const result = await apiRequest('POST', `/nodes/${node}/qemu/${vmid}/agent/exec`, body);
  const pid = result.pid;

  // Poll for completion
  const maxWait = 30000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const status = await apiRequest('GET', `/nodes/${node}/qemu/${vmid}/agent/exec-status?pid=${pid}`);
      if (status.exited !== undefined) {
        return {
          exitcode: status.exitcode || 0,
          outData: status['out-data'] || '',
          errData: status['err-data'] || '',
        };
      }
    } catch {
      // Agent may not be ready yet
    }
  }
  throw new Error(`Guest exec on VM ${vmid} timed out after ${maxWait / 1000}s`);
}

/**
 * Wait for the QEMU guest agent to become responsive on a VM.
 */
async function waitForGuestAgent(node, vmid, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await apiRequest('POST', `/nodes/${node}/qemu/${vmid}/agent/ping`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error(`Guest agent on VM ${vmid} not responsive after ${maxWaitMs / 1000}s`);
}

/**
 * Deploy SSH public key to a VM via the guest agent.
 * Adds the key to both root and deploy users' authorized_keys.
 */
async function deploySSHKey(node, vmid, vmName, sshPublicKey) {
  logger.info(CONTEXT, `Deploying SSH key to ${vmName} (VM ${vmid}) on ${node}`);

  await waitForGuestAgent(node, vmid);

  const script = [
    `mkdir -p /root/.ssh /home/deploy/.ssh`,
    `echo '${sshPublicKey}' >> /root/.ssh/authorized_keys`,
    `echo '${sshPublicKey}' >> /home/deploy/.ssh/authorized_keys`,
    `chown -R deploy:deploy /home/deploy/.ssh`,
    `chmod 700 /root/.ssh /home/deploy/.ssh`,
    `chmod 600 /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys`,
    `echo 'SSH_KEY_DEPLOYED'`,
  ].join(' && ');

  const result = await guestExec(node, vmid, '/bin/bash', script);
  if (!result.outData.includes('SSH_KEY_DEPLOYED')) {
    throw new Error(`SSH key deploy failed on ${vmName}: ${result.errData || result.outData}`);
  }

  logger.info(CONTEXT, `SSH key deployed to ${vmName}`);
}

/**
 * Reboot a VM and wait for it to come back online (guest agent responsive).
 * Used after DHCP reservation is created to get the correct IP.
 */
async function rebootVM(node, vmid) {
  logger.info(CONTEXT, `Rebooting VM ${vmid} on ${node}`);
  await apiRequest('POST', `/nodes/${node}/qemu/${vmid}/status/reboot`);
  // Wait a moment for the reboot to initiate
  await new Promise((r) => setTimeout(r, 10000));
  await waitForGuestAgent(node, vmid, 180000);
  logger.info(CONTEXT, `VM ${vmid} back online after reboot`);
}

/**
 * Prepare SSH access to all VMs in an environment.
 * After infra-apply creates VMs and DHCP reservations:
 * 1. Reboot VMs so they pick up DHCP-reserved IPs
 * 2. Deploy the SSH public key via guest agent
 * 3. Scan host keys and update orchestrator's known_hosts
 */
async function prepareVMAccess(appName, envName, envConfig, sshPublicKey) {
  const vms = await findEnvironmentVMs(appName, envName, envConfig);
  if (vms.length === 0) {
    logger.warn(CONTEXT, `No VMs found for ${appName}:${envName} — skipping SSH prep`);
    return { prepared: [], failed: [] };
  }

  logger.info(CONTEXT, `Preparing SSH access for ${vms.length} VMs in ${appName}:${envName}`);
  const prepared = [];
  const failed = [];

  // Step 1: Deploy SSH key to all VMs via guest agent
  for (const vm of vms) {
    try {
      await deploySSHKey(vm.node, vm.vmid, vm.name, sshPublicKey);
      prepared.push(vm.name);
    } catch (err) {
      logger.error(CONTEXT, `Failed to deploy SSH key to ${vm.name}: ${err.message}`);
      failed.push(vm.name);
    }
  }

  // Step 2: Reboot VMs to pick up DHCP reservations
  logger.info(CONTEXT, `Rebooting ${vms.length} VMs to pick up DHCP reservations`);
  const rebootPromises = vms.map(async (vm) => {
    try {
      await rebootVM(vm.node, vm.vmid);
    } catch (err) {
      logger.warn(CONTEXT, `Reboot of ${vm.name} failed: ${err.message}`);
    }
  });
  await Promise.all(rebootPromises);

  // Step 3: Re-deploy SSH key after reboot (in case cloud-init resets authorized_keys)
  for (const vm of vms) {
    try {
      await deploySSHKey(vm.node, vm.vmid, vm.name, sshPublicKey);
    } catch (err) {
      logger.warn(CONTEXT, `Post-reboot SSH key deploy failed for ${vm.name}: ${err.message}`);
    }
  }

  // Step 4: Update known_hosts on orchestrator
  const knownHostsPath = path.join(config.orchestratorHome, '.ssh', 'known_hosts');
  const hosts = Object.values(envConfig.hosts || {}).map((h) => h.ip).filter(Boolean);

  // Remove old entries
  for (const ip of hosts) {
    try {
      const { spawn: sp } = require('child_process');
      await new Promise((resolve) => {
        const proc = sp('ssh-keygen', ['-R', ip], { stdio: 'ignore' });
        proc.on('close', resolve);
      });
    } catch { /* ignore */ }
  }

  // Scan new host keys
  const { spawn: sp } = require('child_process');
  for (const ip of hosts) {
    try {
      await new Promise((resolve, reject) => {
        const proc = sp('ssh-keyscan', ['-H', ip], { timeout: 10000 });
        let out = '';
        proc.stdout.on('data', (d) => { out += d; });
        proc.on('close', (code) => {
          if (code === 0 && out.trim()) {
            fs.appendFileSync(knownHostsPath, out);
            logger.info(CONTEXT, `Scanned host key for ${ip}`);
          }
          resolve();
        });
        proc.on('error', resolve);
      });
    } catch { /* ignore */ }
  }

  return { prepared, failed };
}

module.exports = {
  listVMs,
  findEnvironmentVMs,
  destroyEnvironmentVMs,
  ensureCloudInitSnippet,
  prepareVMAccess,
  guestExec,
  waitForGuestAgent,
};
