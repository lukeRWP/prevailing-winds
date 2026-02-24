const path = require('path');
const executor = require('./executor');
const credentialGenerator = require('./credentialGenerator');
const tfvarsGenerator = require('./tfvarsGenerator');
const inventoryGenerator = require('./inventoryGenerator');
const proxmoxClient = require('./proxmoxClient');
const unifiClient = require('./unifiClient');
const appRegistry = require('./appRegistry');
const config = require('../config');
const logger = require('../utils/logger');

async function cleanupOrphanVMs(appName, envName, label) {
  const envConfig = appRegistry.getEnvironment(appName, envName);
  if (!envConfig) return;

  try {
    logger.info('lifecycle', `${label}: cleaning up orphan VMs for ${appName}:${envName}`);
    const result = await proxmoxClient.destroyEnvironmentVMs(appName, envName, envConfig);
    logger.info('lifecycle', `${label}: destroyed=${result.destroyed.join(',') || 'none'}, skipped=${result.skipped.join(',') || 'none'}`);
  } catch (err) {
    logger.warn('lifecycle', `${label}: VM cleanup failed (continuing): ${err.message}`);
  }
}

// Ordered list of build pipeline steps — used for resume-from-step
const BUILD_STEPS = [
  { name: 'infra-apply-shared', type: 'infra-apply-shared' },
  { name: 'infra-apply', type: 'infra-apply' },
  { name: 'prepare-ssh', type: 'prepare-ssh' },
  { name: 'provision', type: 'provision' },
  { name: 'db-setup', type: 'db-setup' },
  { name: 'deploy', type: 'deploy' },
];

async function buildEnvironment(appName, envName, { ref, force = false, resumeFrom } = {}) {
  logger.info('lifecycle', `Starting build-environment for ${appName}:${envName}${resumeFrom ? ` (resuming from ${resumeFrom})` : ''}`);

  // Validate resumeFrom step name
  if (resumeFrom) {
    const validSteps = BUILD_STEPS.map(s => s.name);
    if (!validSteps.includes(resumeFrom)) {
      throw new Error(`Invalid resumeFrom step '${resumeFrom}'. Valid steps: ${validSteps.join(', ')}`);
    }
  }

  // Step 0: Force cleanup orphan VMs before rebuild (skip on resume)
  if (force && !resumeFrom) {
    await cleanupOrphanVMs(appName, envName, 'Force build');
  }

  // Pre-build setup always runs (idempotent and fast)
  // Step 1: Generate credentials and store in Vault
  const credResult = await credentialGenerator.generateEnvSecrets(appName, envName, { force });
  logger.info('lifecycle', `Credentials: ${credResult.created ? 'generated' : 'already exist'}`);

  // Step 2: Generate tfvars from manifest
  await tfvarsGenerator.writeTfvars(appName, envName);

  // Step 2.5: Generate Ansible inventory from manifest (ensures hosts.yml matches app.yml)
  const inventoryBaseDir = path.join(config.orchestratorHome, 'ansible', 'inventories');
  inventoryGenerator.writeInventory(appName, envName, null, { inventoryBaseDir });
  logger.info('lifecycle', `Inventory generated for ${appName}:${envName}`);

  // Step 2.6: Ensure cloud-init snippet exists on Proxmox node
  const envConfig = appRegistry.getEnvironment(appName, envName);
  const targetNode = Object.values(envConfig.hosts || {})[0]?.proxmoxNode || 'prx002';
  try {
    await proxmoxClient.ensureCloudInitSnippet(targetNode);
  } catch (err) {
    logger.warn('lifecycle', `Cloud-init snippet upload failed (may already exist): ${err.message}`);
  }

  // Determine which steps to run
  const startIdx = resumeFrom ? BUILD_STEPS.findIndex(s => s.name === resumeFrom) : 0;
  const stepsToRun = BUILD_STEPS.slice(startIdx);

  if (resumeFrom) {
    logger.info('lifecycle', `Resuming from step ${startIdx + 1}/${BUILD_STEPS.length}: ${resumeFrom} (skipping ${startIdx} steps)`);
  }

  // Queue selected steps serially via the operation queue
  const initiatedBy = resumeFrom ? 'lifecycle:resume' : 'lifecycle:build';
  const ops = [];
  for (const step of stepsToRun) {
    ops.push(await executor.enqueue(appName, envName, step.type, { ref, initiatedBy }));
  }

  const stepNames = stepsToRun.map(s => s.name).join(' → ');
  logger.info('lifecycle', `Build pipeline queued for ${appName}:${envName}: ${ops.length} operations`);

  return {
    operations: ops,
    message: `Build pipeline queued: ${stepNames}`,
  };
}

async function destroyEnvironment(appName, envName, { ref } = {}) {
  logger.info('lifecycle', `Starting destroy for ${appName}:${envName}`);

  // Step 1: Clean up orphan VMs via Proxmox API (pre-terraform)
  await cleanupOrphanVMs(appName, envName, 'Destroy');

  // Step 1.5: Clean up ghost UniFi clients (DHCP lease records)
  // Without this, old lease records block new DHCP reservations on rebuild
  // with "FixedIpAlreadyUsedByClient" errors.
  try {
    const result = await unifiClient.cleanupEnvironmentClients(appName, envName);
    logger.info('lifecycle', `Destroy: forgot ${result.forgotten} UniFi ghost clients`);
  } catch (err) {
    logger.warn('lifecycle', `Destroy: UniFi ghost cleanup failed (continuing): ${err.message}`);
  }

  // Step 2: Generate tfvars so Terraform knows what to destroy
  await tfvarsGenerator.writeTfvars(appName, envName);

  // Step 2.5: Regenerate inventory (needed for consistent state)
  const inventoryBaseDir = path.join(config.orchestratorHome, 'ansible', 'inventories');
  inventoryGenerator.writeInventory(appName, envName, null, { inventoryBaseDir });

  // Step 3: Terraform destroy (cleans up DNS, DHCP, firewall, etc.)
  const opId = await executor.enqueue(appName, envName, 'infra-destroy', { ref, initiatedBy: 'lifecycle:destroy' });

  return {
    operations: [opId],
    message: `Destroy queued for ${appName}:${envName} (orphan VMs cleaned via Proxmox API)`,
  };
}

module.exports = { buildEnvironment, destroyEnvironment, BUILD_STEPS };
