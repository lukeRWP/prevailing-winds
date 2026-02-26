const fs = require('fs');
const path = require('path');

// Load secrets from api.env (ADMIN_TOKEN, VAULT_*, APP_TOKEN_*)
function loadEnvFile(filePath) {
  const vars = {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
      }
    }
  } catch {
    // api.env may not exist in dev
  }
  return vars;
}

const envFile = loadEnvFile(path.join(__dirname, '..', 'api.env'));

module.exports = {
  apps: [
    {
      name: 'orchestrator-api',
      script: 'index.js',
      cwd: '/opt/orchestrator/api',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 8500,
        ...envFile,
      },
    }
  ]
};
