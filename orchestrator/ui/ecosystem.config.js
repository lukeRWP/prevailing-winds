const fs = require('fs');
const path = require('path');

// Load secrets from ui.env (AUTH_*, ADMIN_TOKEN, APP_TOKEN_*)
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
    // ui.env may not exist in dev
  }
  return vars;
}

const envFile = loadEnvFile(path.join(__dirname, '..', 'ui.env'));

module.exports = {
  apps: [{
    name: 'orchestrator-ui',
    script: 'scripts/start.js',
    cwd: '/opt/orchestrator/ui',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      PORT: 3101,
      HOSTNAME: '127.0.0.1',
      API_URL: 'http://localhost:8500',
      ...envFile,
    },
  }],
};
