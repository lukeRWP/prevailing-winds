const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const config = require('../config');
const vault = require('./vault');
const gitManager = require('./gitManager');
const queue = require('./operationQueue');
const appRegistry = require('./appRegistry');
const tfvarsGenerator = require('./tfvarsGenerator');
const ansibleVarsGenerator = require('./ansibleVarsGenerator');

const proxmoxClient = require('./proxmoxClient');

const activeProcesses = new Map();
const sseClients = new Map();
const envLocks = new Map();

// Per-operation-type timeout (milliseconds)
const TIMEOUT_MAP = {
  'provision': 45 * 60 * 1000,
  'deploy': 20 * 60 * 1000,
  'deploy-server': 20 * 60 * 1000,
  'deploy-client': 20 * 60 * 1000,
  'infra-apply': 20 * 60 * 1000,
  'infra-apply-shared': 20 * 60 * 1000,
  'infra-plan': 10 * 60 * 1000,
  'infra-plan-shared': 10 * 60 * 1000,
  'infra-destroy': 20 * 60 * 1000,
  'db-setup': 10 * 60 * 1000,
  'db-migrate': 10 * 60 * 1000,
  'db-backup': 15 * 60 * 1000,
};
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_SSH_KEY_PATH = process.env.ANSIBLE_PRIVATE_KEY_FILE || path.join(config.orchestratorHome, '.ssh', 'deploy_key');

// Operation types that use infrastructure (Terraform/Ansible from PW repo)
const INFRA_OPS = [
  'provision', 'deploy', 'deploy-server', 'deploy-client', 'rollback',
  'infra-plan', 'infra-apply', 'infra-destroy',
  'infra-plan-shared', 'infra-apply-shared',
  'db-setup', 'db-migrate', 'db-backup', 'db-seed', 'seed',
  'env-start', 'env-stop',
  'prepare-ssh',
];

// Inline operations handled directly (no child process spawn)
const INLINE_OPS = ['prepare-ssh'];

const TERRAFORM_OPS = ['infra-plan', 'infra-apply', 'infra-destroy', 'infra-plan-shared', 'infra-apply-shared'];
const ANSIBLE_OPS = [
  'provision', 'deploy', 'deploy-server', 'deploy-client', 'rollback',
  'db-setup', 'db-migrate', 'db-backup', 'db-seed', 'seed',
  'env-start', 'env-stop',
];

function lockKey(app, env) {
  return `${app}:${env}`;
}

async function enqueue(app, env, type, { ref, vars, callbackUrl, dryRun, initiatedBy } = {}) {
  const opId = queue.create({ app, env, type, ref, vars, callbackUrl, initiatedBy });
  logger.info('executor', `Enqueued ${type} for ${app}:${env} — op ${opId}`);
  setImmediate(() => processQueue(app, env));
  return opId;
}

async function processQueue(app, env) {
  const key = lockKey(app, env);
  if (envLocks.get(key)) return;

  const next = queue.getNextQueued(app, env);
  if (!next) return;

  envLocks.set(key, true);

  try {
    await executeOperation(next);
  } finally {
    envLocks.delete(key);
    setImmediate(() => processQueue(app, env));
  }
}

async function executeOperation(op) {
  const { id, app, env, type, ref, vars } = op;
  queue.markRunning(id);
  emitSSE(id, { event: 'status', data: 'running' });

  const tempFiles = [];

  try {
    const manifest = appRegistry.get(app);
    if (!manifest) throw new Error(`Unknown app: ${app}`);

    // Read secrets from Vault (env-specific path)
    const appSecrets = env ? (await vault.readSecret(`secret/data/apps/${app}/${env}`) || {}) : {};
    const infraSecrets = await vault.readSecret('secret/data/pw/infra') || {};

    // Write SSH key to tmpfs (prefer infra secrets, fall back to app secrets, then local file)
    const sshKey = infraSecrets.ssh_private_key || appSecrets.ssh_private_key;
    let sshKeyPath = await writeTempSecret(sshKey, 'id_rsa', tempFiles);
    if (!sshKeyPath && fs.existsSync(DEFAULT_SSH_KEY_PATH)) {
      sshKeyPath = DEFAULT_SSH_KEY_PATH;
      appendAndEmit(id, `[orchestrator] Using local SSH key (Vault not configured)\n`);
    }

    // Only checkout app repo for non-infrastructure operations
    if (!TERRAFORM_OPS.includes(type) && !INLINE_OPS.includes(type)) {
      const defaultBranch = manifest.environments?.[env]?.pipeline?.autoDeployBranch || 'master';
      await gitManager.ensureRepo(app, manifest.repo);
      const sha = await gitManager.pull(app, ref || defaultBranch);
      appendAndEmit(id, `[orchestrator] Checked out ${sha.substring(0, 8)}\n`);
    }

    // Infrastructure lives in PW's directories on the orchestrator, not the app repo
    const infraDir = config.orchestratorHome;

    // Auto-generate tfvars before Terraform operations
    if (TERRAFORM_OPS.includes(type)) {
      const isShared = type.includes('shared');
      const tfEnv = isShared ? 'shared' : env;
      appendAndEmit(id, `[orchestrator] Generating tfvars for ${tfEnv}...\n`);
      await tfvarsGenerator.writeTfvars(app, tfEnv);
    }

    // Auto-generate Ansible vault.yml from HashiCorp Vault before Ansible operations
    if (ANSIBLE_OPS.includes(type) && env !== 'shared') {
      const inventoryDir = path.join(infraDir, 'ansible', 'inventories', env);
      try {
        appendAndEmit(id, `[orchestrator] Generating Ansible vars from Vault for ${app}:${env}...\n`);
        await ansibleVarsGenerator.writeAnsibleVaultFile(app, env, inventoryDir);
      } catch (err) {
        appendAndEmit(id, `[orchestrator] Warning: Could not generate Ansible vars: ${err.message}\n`);
      }
    }

    const childEnv = buildChildEnv({ infraSecrets, appSecrets, sshKeyPath, manifest, env });
    const parsedVars = typeof vars === 'string' ? JSON.parse(vars) : (vars || {});

    // Inline operations — handled directly without spawning a child process
    if (INLINE_OPS.includes(type)) {
      await executeInlineOp(id, type, { app, env, manifest, infraSecrets, appSecrets });
      queue.markSuccess(id);
      emitSSE(id, { event: 'status', data: 'success' });
      appendAndEmit(id, `[orchestrator] Operation completed successfully\n`);
      if (op.callback_url) notifyCallback(op.callback_url, id, 'success').catch(() => {});
      return;
    }

    let cmd, args, cwd;

    // Build tarballs before deploy operations
    const DEPLOY_OPS = ['deploy', 'deploy-server', 'deploy-client'];
    if (DEPLOY_OPS.includes(type)) {
      const appRepoDir = path.join(config.reposDir, app);
      appendAndEmit(id, `[orchestrator] Building app tarballs...\n`);

      const buildConfig = manifest.build || {};
      const buildEnvOverrides = buildConfig.env || {};
      const buildEnv = { ...childEnv, ...buildEnvOverrides };
      const components = buildConfig.components || {};

      if (Object.keys(components).length === 0) {
        throw new Error(`No build.components defined in manifest for ${app}`);
      }

      for (const [compName, comp] of Object.entries(components)) {
        appendAndEmit(id, `[orchestrator] Building ${compName}...\n`);

        // Build shell commands for this component
        const steps = [];
        if (comp.dir) steps.push(`cd ${comp.dir}`);
        if (comp.install) steps.push(comp.install);
        if (comp.build) steps.push(comp.build);

        // Create tarball
        const tarball = comp.tarball || {};
        const tarballName = tarball.name || `${compName}.tar.gz`;
        const tarballDest = comp.dir ? `../${tarballName}` : tarballName;
        if (tarball.from) {
          // Tarball from a subdirectory (e.g., client build output)
          const tarArgs = tarball.args || `.`;
          steps.push(`tar -czf ${tarballDest} ${tarArgs}`);
        } else if (tarball.includes) {
          // Tarball specific files/dirs
          steps.push(`tar -czf ${tarballDest} ${tarball.includes.join(' ')}`);
        }

        if (comp.dir) steps.push('cd ..');

        const buildExitCode = await spawnAndStream(id, '/bin/bash', ['-c', steps.join(' && ')], { cwd: appRepoDir, env: buildEnv });
        if (buildExitCode !== 0) throw new Error(`Build of ${compName} failed with code ${buildExitCode}`);

        // Register tarball path for Ansible
        parsedVars[`${compName}_tarball`] = path.join(appRepoDir, tarballName);
      }

      appendAndEmit(id, `[orchestrator] Tarballs ready\n`);
    }

    switch (type) {
      case 'provision':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, parsedVars, 'provision'));
        break;
      case 'deploy':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, { ...parsedVars, environment_name: env }, 'deploy'));
        break;
      case 'deploy-server':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, { ...parsedVars, environment_name: env, deploy_component: 'server' }, 'deploy'));
        break;
      case 'deploy-client':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, { ...parsedVars, environment_name: env, deploy_component: 'client' }, 'deploy'));
        break;
      case 'rollback':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, { ...parsedVars, environment_name: env, rollback: 'true' }, 'rollback'));
        break;
      case 'infra-plan':
        ({ cmd, args, cwd } = buildTerraformCmd(infraDir, 'plan', env, manifest, parsedVars));
        break;
      case 'infra-apply':
        ({ cmd, args, cwd } = buildTerraformCmd(infraDir, 'apply', env, manifest, parsedVars));
        break;
      case 'infra-destroy':
        ({ cmd, args, cwd } = buildTerraformCmd(infraDir, 'destroy', env, manifest, parsedVars));
        break;
      case 'infra-plan-shared':
        ({ cmd, args, cwd } = buildTerraformCmd(infraDir, 'plan', 'shared', manifest, parsedVars));
        break;
      case 'infra-apply-shared':
        ({ cmd, args, cwd } = buildTerraformCmd(infraDir, 'apply', 'shared', manifest, parsedVars));
        break;
      case 'db-setup':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, parsedVars, 'db-setup'));
        break;
      case 'db-migrate':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, parsedVars, 'db-migrate'));
        break;
      case 'db-backup':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, parsedVars, 'db-backup'));
        break;
      case 'db-seed':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, parsedVars, 'db-seed'));
        break;
      case 'seed':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, parsedVars, 'seed'));
        break;
      case 'env-start':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, parsedVars, 'env-start'));
        break;
      case 'env-stop':
        ({ cmd, args, cwd } = buildAnsibleCmd(infraDir, null, env, manifest, parsedVars, 'env-stop'));
        break;
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }

    appendAndEmit(id, `[orchestrator] Running: ${cmd} ${args.join(' ')}\n`);

    const timeoutMs = TIMEOUT_MAP[type] || DEFAULT_TIMEOUT_MS;
    const exitCode = await spawnAndStream(id, cmd, args, { cwd, env: childEnv, timeoutMs });

    if (exitCode !== 0) {
      throw new Error(`Process exited with code ${exitCode}`);
    }

    queue.markSuccess(id);
    emitSSE(id, { event: 'status', data: 'success' });
    appendAndEmit(id, `[orchestrator] Operation completed successfully\n`);

    if (op.callback_url) {
      notifyCallback(op.callback_url, id, 'success').catch(() => {});
    }
  } catch (err) {
    queue.markFailed(id, err.message);
    appendAndEmit(id, `[orchestrator] FAILED: ${err.message}\n`);
    emitSSE(id, { event: 'status', data: 'failed' });
    logger.error('executor', `Operation ${id} failed: ${err.message}`);

    if (op.callback_url) {
      notifyCallback(op.callback_url, id, 'failed', err.message).catch(() => {});
    }
  } finally {
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch { /* already cleaned */ }
    }
    activeProcesses.delete(id);
    emitSSE(id, { event: 'done', data: '' });
  }
}

function spawnAndStream(opId, cmd, args, opts) {
  return new Promise((resolve) => {
    const { timeoutMs, ...spawnOpts } = opts || {};
    const effectiveTimeout = timeoutMs || DEFAULT_TIMEOUT_MS;

    const child = spawn(cmd, args, {
      ...spawnOpts,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeProcesses.set(opId, child);

    // Process timeout — kill to prevent stuck operations
    const timer = setTimeout(() => {
      appendAndEmit(opId, `[orchestrator] Process timeout after ${effectiveTimeout / 60000} minutes — killing\n`);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 5000);
    }, effectiveTimeout);

    child.stdout.on('data', (chunk) => appendAndEmit(opId, chunk.toString()));
    child.stderr.on('data', (chunk) => appendAndEmit(opId, chunk.toString()));

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      appendAndEmit(opId, `[spawn error] ${err.message}\n`);
      resolve(1);
    });
  });
}

function buildChildEnv({ infraSecrets, appSecrets, sshKeyPath, manifest, env }) {
  const childEnv = { ...process.env };

  // Terraform credentials from infra secrets (preferred) or app secrets (fallback)
  const tfSecrets = { ...appSecrets, ...infraSecrets };
  if (tfSecrets.proxmox_api_token) childEnv.TF_VAR_proxmox_api_token = tfSecrets.proxmox_api_token;
  if (tfSecrets.unifi_api_key) childEnv.TF_VAR_unifi_api_key = tfSecrets.unifi_api_key;
  if (tfSecrets.unifi_api_url) childEnv.TF_VAR_unifi_api_url = tfSecrets.unifi_api_url;
  if (tfSecrets.proxmox_api_url) childEnv.TF_VAR_proxmox_api_url = tfSecrets.proxmox_api_url;

  // MinIO/S3 credentials for Terraform backend
  if (tfSecrets.minio_access_key) childEnv.AWS_ACCESS_KEY_ID = tfSecrets.minio_access_key;
  if (tfSecrets.minio_secret_key) childEnv.AWS_SECRET_ACCESS_KEY = tfSecrets.minio_secret_key;
  // Fallback to old key names
  if (!childEnv.AWS_ACCESS_KEY_ID && tfSecrets.aws_access_key_id) childEnv.AWS_ACCESS_KEY_ID = tfSecrets.aws_access_key_id;
  if (!childEnv.AWS_SECRET_ACCESS_KEY && tfSecrets.aws_secret_access_key) childEnv.AWS_SECRET_ACCESS_KEY = tfSecrets.aws_secret_access_key;

  // MinIO CA cert for Terraform S3 backend TLS
  const minioCaCertPath = path.join(config.orchestratorHome, 'certs', 'minio-ca.crt');
  if (fs.existsSync(minioCaCertPath)) {
    childEnv.AWS_CA_BUNDLE = minioCaCertPath;
  }

  // Ansible SSH key
  if (sshKeyPath) {
    childEnv.ANSIBLE_PRIVATE_KEY_FILE = sshKeyPath;
    childEnv.GIT_SSH_COMMAND = `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=accept-new`;
  }

  // Pass through environment context
  childEnv.TARGET_ENV = env;
  childEnv.APP_NAME = manifest.name;

  return childEnv;
}

function playbookForType(type) {
  const map = {
    'provision': 'playbooks/site.yml',
    'deploy': 'playbooks/deploy-all.yml',
    'rollback': 'playbooks/deploy-all.yml',
    'db-setup': 'playbooks/db-setup.yml',
    'db-migrate': 'playbooks/db-migrate.yml',
    'db-backup': 'playbooks/db-backup.yml',
    'db-seed': 'playbooks/env-seed.yml',
    'seed': 'playbooks/env-seed.yml',
    'env-start': 'playbooks/env-start.yml',
    'env-stop': 'playbooks/env-stop.yml',
  };
  return map[type] || 'playbooks/site.yml';
}

function buildAnsibleCmd(infraDir, _playbook, env, manifest, vars, tag) {
  const ansibleDir = path.join(infraDir, 'ansible');
  const playbookPath = path.join(ansibleDir, playbookForType(tag));
  const inventoryPath = path.join(ansibleDir, 'inventories', env, 'hosts.yml');
  const ansibleBin = path.join(config.ansibleVenv, 'bin', 'ansible-playbook');

  const args = [playbookPath, '-i', inventoryPath, '--become'];

  // Ansible core 2.20+ evaluates hosts: directives before loading group_vars,
  // so group mapping variables (group_servers, group_databases, etc.) must be
  // passed as extra-vars to be available at parse time.
  const appName = manifest.name;
  const appRepoDir = path.join(config.reposDir, appName);
  const groupVars = {
    app_name: appName,
    group_servers: `${appName}_servers`,
    group_clients: `${appName}_clients`,
    group_databases: `${appName}_databases`,
    group_storage: `${appName}_storage`,
    group_monitoring: `${appName}_monitoring`,
    group_runner: `${appName}_runner`,
    sql_init_dir: path.join(appRepoDir, 'SQL'),
    db_migrations_path: path.join(appRepoDir, 'SQL', 'migrations'),
  };

  // Flow database config from manifest to Ansible
  const dbConfig = manifest.databases || {};
  if (dbConfig.list) groupVars.mysql_databases = dbConfig.list;
  if (dbConfig.schemaPrefix) groupVars.mysql_schema_prefix = dbConfig.schemaPrefix;
  if (dbConfig.adminDb) groupVars.mysql_admin_db = dbConfig.adminDb;
  if (dbConfig.envVars) groupVars.app_db_env_vars = dbConfig.envVars;

  const mergedVars = { ...groupVars, ...(vars || {}) };
  args.push('-e', JSON.stringify(mergedVars));

  return { cmd: ansibleBin, args, cwd: ansibleDir };
}

function buildTerraformCmd(infraDir, action, workspace, manifest, vars) {
  const tfDir = path.join(infraDir, 'terraform');
  const envConfig = manifest.environments && manifest.environments[workspace];
  const tfWorkspace = envConfig ? (envConfig.terraformWorkspace || workspace) : workspace;
  const tfvarsFile = path.join('environments', `${workspace}.tfvars`);

  // Build init + workspace select + action as a single shell command
  const cmds = [
    'terraform init -input=false -reconfigure',
    `terraform workspace select ${tfWorkspace} || terraform workspace new ${tfWorkspace}`,
  ];

  const actionArgs = [action];
  if (action === 'apply' || action === 'destroy') actionArgs.push('-auto-approve');
  actionArgs.push('-input=false');
  if (fs.existsSync(path.join(tfDir, tfvarsFile))) {
    actionArgs.push(`-var-file=${tfvarsFile}`);
  }
  if (vars && Object.keys(vars).length > 0) {
    for (const [k, v] of Object.entries(vars)) {
      actionArgs.push('-var', `${k}=${v}`);
    }
  }
  const tfCmd = `terraform ${actionArgs.join(' ')}`;

  // Retry apply once — the Proxmox provider may not populate MAC addresses for
  // single-NIC VMs on first create, causing dependent resources (DHCP) to fail.
  // A second apply reads the MACs from the existing VMs and succeeds.
  if (action === 'apply') {
    cmds.push(`${tfCmd} || ${tfCmd}`);
  } else {
    cmds.push(tfCmd);
  }

  return { cmd: '/bin/bash', args: ['-c', cmds.join(' && ')], cwd: tfDir };
}

async function writeTempSecret(value, prefix, tempFiles) {
  if (!value) return null;

  fs.mkdirSync(config.secretsDir, { recursive: true });
  const filePath = path.join(config.secretsDir, `${prefix}-${uuidv4()}`);
  fs.writeFileSync(filePath, value, { mode: 0o600 });
  tempFiles.push(filePath);
  return filePath;
}

function appendAndEmit(opId, text) {
  queue.appendOutput(opId, text);
  emitSSE(opId, { event: 'log', data: text });
}

function emitSSE(opId, { event, data }) {
  const clients = sseClients.get(opId);
  if (!clients || clients.length === 0) return;

  for (const res of clients) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch { /* client disconnected */ }
  }
}

function addSSEClient(opId, res) {
  if (!sseClients.has(opId)) sseClients.set(opId, []);
  sseClients.get(opId).push(res);

  res.on('close', () => {
    const clients = sseClients.get(opId);
    if (clients) {
      const idx = clients.indexOf(res);
      if (idx !== -1) clients.splice(idx, 1);
    }
  });
}

function cancelProcess(opId) {
  const child = activeProcesses.get(opId);
  if (child) {
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 5000);
    return true;
  }
  return queue.cancel(opId);
}

async function notifyCallback(url, opId, status, error) {
  try {
    const https = url.startsWith('https') ? require('https') : require('http');
    const body = JSON.stringify({ opId, status, error });
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    });
    req.write(body);
    req.end();
  } catch (err) {
    logger.warn('executor', `Callback notification failed: ${err.message}`);
  }
}

async function executeInlineOp(opId, type, { app, env, manifest, infraSecrets, appSecrets }) {
  switch (type) {
    case 'prepare-ssh': {
      const envConfig = manifest.environments?.[env];
      if (!envConfig) throw new Error(`No environment config for ${app}:${env}`);

      const sshPublicKey = infraSecrets.ssh_public_key || appSecrets.ssh_public_key;
      if (!sshPublicKey) throw new Error('No SSH public key found in Vault (ssh_public_key)');

      appendAndEmit(opId, `[orchestrator] Preparing SSH access for ${app}:${env} VMs...\n`);
      appendAndEmit(opId, `[orchestrator] Will: deploy SSH key via guest agent → reboot for DHCP → re-deploy key → scan host keys\n`);

      const result = await proxmoxClient.prepareVMAccess(app, env, envConfig, sshPublicKey);

      appendAndEmit(opId, `[orchestrator] SSH prepared: ${result.prepared.join(', ') || 'none'}\n`);
      if (result.failed.length > 0) {
        appendAndEmit(opId, `[orchestrator] SSH failed: ${result.failed.join(', ')}\n`);
        throw new Error(`SSH key deployment failed for: ${result.failed.join(', ')}`);
      }
      break;
    }
    default:
      throw new Error(`Unknown inline operation: ${type}`);
  }
}

module.exports = { enqueue, addSSEClient, cancelProcess };
