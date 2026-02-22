const executor = require('./executor');
const credentialGenerator = require('./credentialGenerator');
const tfvarsGenerator = require('./tfvarsGenerator');
const proxmoxClient = require('./proxmoxClient');
const appRegistry = require('./appRegistry');
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

async function buildEnvironment(appName, envName, { ref, force = false } = {}) {
  logger.info('lifecycle', `Starting build-environment for ${appName}:${envName}`);

  // Step 0: Force cleanup orphan VMs before rebuild
  if (force) {
    await cleanupOrphanVMs(appName, envName, 'Force build');
  }

  // Step 1: Generate credentials and store in Vault
  const credResult = await credentialGenerator.generateEnvSecrets(appName, envName, { force });
  logger.info('lifecycle', `Credentials: ${credResult.created ? 'generated' : 'already exist'}`);

  // Step 2: Generate tfvars from manifest
  await tfvarsGenerator.writeTfvars(appName, envName);

  // Step 2.5: Ensure cloud-init snippet exists on Proxmox node
  const envConfig = appRegistry.getEnvironment(appName, envName);
  const targetNode = Object.values(envConfig.hosts || {})[0]?.proxmoxNode || 'prx002';
  try {
    await proxmoxClient.ensureCloudInitSnippet(targetNode);
  } catch (err) {
    logger.warn('lifecycle', `Cloud-init snippet upload failed (may already exist): ${err.message}`);
  }

  // Steps 3-7 are queued and run serially via the operation queue
  const ops = [];

  // Step 3: Ensure cluster-level resources exist (security groups, pools, VLANs)
  ops.push(await executor.enqueue(appName, envName, 'infra-apply-shared', { ref }));

  // Step 4: Terraform apply (VMs, networking, firewall, DNS, DHCP)
  ops.push(await executor.enqueue(appName, envName, 'infra-apply', { ref }));

  // Step 5: Prepare SSH access (deploy key via guest agent, reboot for DHCP, scan host keys)
  ops.push(await executor.enqueue(appName, envName, 'prepare-ssh', { ref }));

  // Step 6: Ansible provision (OS hardening, MySQL, MinIO, app-server, nginx)
  ops.push(await executor.enqueue(appName, envName, 'provision', { ref }));

  // Step 7: Database setup (create databases and schema)
  ops.push(await executor.enqueue(appName, envName, 'db-setup', { ref }));

  // Step 8: Deploy application
  ops.push(await executor.enqueue(appName, envName, 'deploy', { ref }));

  logger.info('lifecycle', `Build pipeline queued for ${appName}:${envName}: ${ops.length} operations`);

  return {
    operations: ops,
    message: `Build pipeline queued: infra-shared → infra-apply → prepare-ssh → provision → db-setup → deploy`,
  };
}

async function destroyEnvironment(appName, envName, { ref } = {}) {
  logger.info('lifecycle', `Starting destroy for ${appName}:${envName}`);

  // Step 1: Clean up orphan VMs via Proxmox API (pre-terraform)
  await cleanupOrphanVMs(appName, envName, 'Destroy');

  // Step 2: Generate tfvars so Terraform knows what to destroy
  await tfvarsGenerator.writeTfvars(appName, envName);

  // Step 3: Terraform destroy (cleans up DNS, DHCP, firewall, etc.)
  const opId = await executor.enqueue(appName, envName, 'infra-destroy', { ref });

  return {
    operations: [opId],
    message: `Destroy queued for ${appName}:${envName} (orphan VMs cleaned via Proxmox API)`,
  };
}

module.exports = { buildEnvironment, destroyEnvironment };
