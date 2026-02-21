const executor = require('./executor');
const credentialGenerator = require('./credentialGenerator');
const tfvarsGenerator = require('./tfvarsGenerator');
const logger = require('../utils/logger');

async function buildEnvironment(appName, envName, { ref, force = false } = {}) {
  logger.info('lifecycle', `Starting build-environment for ${appName}:${envName}`);

  // Step 1: Generate credentials and store in Vault
  const credResult = await credentialGenerator.generateEnvSecrets(appName, envName, { force });
  logger.info('lifecycle', `Credentials: ${credResult.created ? 'generated' : 'already exist'}`);

  // Step 2: Generate tfvars from manifest
  await tfvarsGenerator.writeTfvars(appName, envName);

  // Steps 3-6 are queued and run serially via the operation queue
  const ops = [];

  // Step 3: Terraform apply (VMs, networking, firewall, DNS, DHCP)
  ops.push(await executor.enqueue(appName, envName, 'infra-apply', { ref }));

  // Step 4: Ansible provision (OS hardening, MySQL, MinIO, app-server, nginx)
  ops.push(await executor.enqueue(appName, envName, 'provision', { ref }));

  // Step 5: Database setup (create databases and schema)
  ops.push(await executor.enqueue(appName, envName, 'db-setup', { ref }));

  // Step 6: Deploy application
  ops.push(await executor.enqueue(appName, envName, 'deploy', { ref }));

  logger.info('lifecycle', `Build pipeline queued for ${appName}:${envName}: ${ops.length} operations`);

  return {
    operations: ops,
    message: `Build pipeline queued: infra-apply → provision → db-setup → deploy`,
  };
}

async function destroyEnvironment(appName, envName, { ref } = {}) {
  logger.info('lifecycle', `Starting destroy for ${appName}:${envName}`);

  // Generate tfvars so Terraform knows what to destroy
  await tfvarsGenerator.writeTfvars(appName, envName);

  const opId = await executor.enqueue(appName, envName, 'infra-destroy', { ref });

  return {
    operations: [opId],
    message: `Destroy queued for ${appName}:${envName}`,
  };
}

module.exports = { buildEnvironment, destroyEnvironment };
