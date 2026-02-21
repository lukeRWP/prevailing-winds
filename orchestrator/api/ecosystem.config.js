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
        ORCHESTRATOR_HOME: '/opt/orchestrator',
        VAULT_ADDR: 'https://10.0.5.40:8200',
        ANSIBLE_VENV: '/opt/orchestrator/venv'
      }
    }
  ]
};
