module.exports = {
  apps: [{
    name: 'orchestrator-ui',
    script: 'server.js',
    cwd: '/opt/orchestrator/ui',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      PORT: 3100,
      HOSTNAME: '0.0.0.0',
      API_URL: 'http://localhost:8500',
    },
  }],
};
