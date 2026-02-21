const path = require('path');

const config = {
  port: parseInt(process.env.PORT, 10) || 8500,
  nodeEnv: process.env.NODE_ENV || 'development',
  orchestratorHome: process.env.ORCHESTRATOR_HOME || '/opt/orchestrator',
  vault: {
    addr: process.env.VAULT_ADDR || 'https://10.0.5.40:8200',
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.VAULT_SECRET_ID
  },
  adminToken: process.env.ADMIN_TOKEN,
  get appTokens() {
    const tokens = {};
    for (const [key, value] of Object.entries(process.env)) {
      const match = key.match(/^APP_TOKEN_(.+)$/);
      if (match && value) tokens[match[1].toLowerCase()] = value;
    }
    return tokens;
  },
  ansibleVenv: process.env.ANSIBLE_VENV || '/opt/orchestrator/venv',
  secretsDir: '/run/orchestrator/secrets',
  get appsDir() {
    return path.join(this.orchestratorHome, 'apps');
  },
  get reposDir() {
    return path.join(this.orchestratorHome, 'repos');
  },
  get dbPath() {
    return path.join(this.orchestratorHome, 'data', 'operations.db');
  }
};

module.exports = config;
