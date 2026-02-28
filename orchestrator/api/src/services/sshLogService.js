const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const SSH_KEY = process.env.ANSIBLE_PRIVATE_KEY_FILE || path.join(config.orchestratorHome, '.ssh', 'deploy_key');
const SSH_USER = config.infra.deployUser || 'deploy';

const SAFE_HOST_RE = /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/;

function validateHost(h) {
  if (!h || !SAFE_HOST_RE.test(h)) throw new Error(`Invalid host: ${h}`);
}

// Map service names to log commands on the remote host
const SERVICE_LOG_COMMANDS = {
  'app-server': 'sudo journalctl -u imp-server -n {lines} --no-pager -o short-iso',
  'imp-server-out': 'tail -n {lines} /home/deploy/.pm2/logs/imp-server-out.log',
  'imp-server-err': 'tail -n {lines} /home/deploy/.pm2/logs/imp-server-error.log',
  'app-client': 'sudo journalctl -u imp-client -n {lines} --no-pager -o short-iso',
  'nginx-access': 'sudo tail -n {lines} /var/log/nginx/access.log',
  'nginx-error': 'sudo tail -n {lines} /var/log/nginx/error.log',
  'mysql': 'sudo tail -n {lines} /var/log/mysql/error.log',
  'mysql-slow': 'sudo tail -n {lines} /var/log/mysql/slow.log',
  'minio': 'sudo journalctl -u minio -n {lines} --no-pager -o short-iso',
};

// Map service names to streaming commands (tail -f or journalctl -f)
// journalctl -f buffers initial -n lines over SSH (no PTY). Work around this
// by dumping the snapshot first (exits → flushes), then exec into follow mode.
const SERVICE_STREAM_COMMANDS = {
  'app-server': 'sudo journalctl -u imp-server -n 50 --no-pager -o short-iso; exec sudo journalctl -u imp-server -f -n 0 -o short-iso',
  'imp-server-out': 'tail -f -n 50 /home/deploy/.pm2/logs/imp-server-out.log',
  'imp-server-err': 'tail -f -n 50 /home/deploy/.pm2/logs/imp-server-error.log',
  'app-client': 'sudo journalctl -u imp-client -n 50 --no-pager -o short-iso; exec sudo journalctl -u imp-client -f -n 0 -o short-iso',
  'nginx-access': 'sudo tail -f -n 50 /var/log/nginx/access.log',
  'nginx-error': 'sudo tail -f -n 50 /var/log/nginx/error.log',
  'mysql': 'sudo tail -f -n 50 /var/log/mysql/error.log',
  'mysql-slow': 'sudo tail -f -n 50 /var/log/mysql/slow.log',
  'minio': 'sudo journalctl -u minio -n 50 --no-pager -o short-iso; exec sudo journalctl -u minio -f -n 0 -o short-iso',
};

// Map service names to the VM role that runs them
const SERVICE_TO_ROLE = {
  'app-server': 'server',
  'imp-server-out': 'server',
  'imp-server-err': 'server',
  'app-client': 'client',
  'nginx-access': 'client',
  'nginx-error': 'client',
  'mysql': 'database',
  'mysql-slow': 'database',
  'minio': 'storage',
};

/**
 * Get a snapshot of recent log lines from a remote host.
 * @param {string} host - IP address of the target VM
 * @param {string} service - Service name (key of SERVICE_LOG_COMMANDS)
 * @param {number} lines - Number of lines to fetch
 * @returns {Promise<string[]>} Array of log lines
 */
function snapshot(host, service, lines = 500) {
  validateHost(host);
  const cmdTemplate = SERVICE_LOG_COMMANDS[service];
  if (!cmdTemplate) {
    return Promise.reject(new Error(`Unknown service: ${service}`));
  }

  const safeLines = Math.max(1, Math.min(Math.floor(Number(lines)) || 500, 10000));
  const cmd = cmdTemplate.replace('{lines}', String(safeLines));

  return new Promise((resolve, reject) => {
    const proc = spawn('ssh', [
      '-i', SSH_KEY,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=5',
      '-o', 'BatchMode=yes',
      `${SSH_USER}@${host}`,
      cmd,
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout) {
        return reject(new Error(`SSH command failed (code ${code}): ${stderr.trim()}`));
      }
      resolve(stdout.split('\n').filter(Boolean));
    });

    proc.on('error', (err) => {
      reject(new Error(`SSH connection failed: ${err.message}`));
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('SSH command timed out'));
    }, 15000);
  });
}

/**
 * Stream live logs from a remote host to an SSE response.
 * @param {string} host - IP address
 * @param {string} service - Service name
 * @param {import('express').Response} res - Express response (already set up for SSE)
 * @returns {{ kill: () => void }} Handle to stop the stream
 */
function stream(host, service, res) {
  validateHost(host);
  const cmd = SERVICE_STREAM_COMMANDS[service];
  if (!cmd) {
    throw new Error(`Unknown service: ${service}`);
  }

  const proc = spawn('ssh', [
    '-i', SSH_KEY,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=5',
    '-o', 'BatchMode=yes',
    '-o', 'ServerAliveInterval=30',
    `${SSH_USER}@${host}`,
    cmd,
  ]);

  logger.info('ssh-logs', `Streaming ${service} from ${host} (pid ${proc.pid})`);

  proc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        res.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
      } catch {
        // client disconnected
      }
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify(text)}\n\n`);
      } catch { /* ignore */ }
    }
  });

  proc.on('close', (code) => {
    logger.info('ssh-logs', `Stream ended for ${service}@${host} (code ${code})`);
    try {
      res.write(`event: done\ndata: ""\n\n`);
      res.end();
    } catch { /* ignore */ }
  });

  proc.on('error', (err) => {
    logger.error('ssh-logs', `Stream error for ${service}@${host}: ${err.message}`);
    try {
      res.write(`event: error\ndata: ${JSON.stringify(err.message)}\n\n`);
      res.end();
    } catch { /* ignore */ }
  });

  return {
    kill() {
      if (!proc.killed) {
        proc.kill('SIGTERM');
        setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); }, 3000);
      }
    },
  };
}

module.exports = {
  snapshot,
  stream,
  SERVICE_LOG_COMMANDS,
  SERVICE_STREAM_COMMANDS,
  SERVICE_TO_ROLE,
};
