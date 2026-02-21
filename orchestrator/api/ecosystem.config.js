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
      // Env vars loaded from /opt/orchestrator/api.env via systemd EnvironmentFile
      // Do not duplicate here — PM2 env block overrides EnvironmentFile values
    }
  ]
};
