const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const SSH_KEY = process.env.ANSIBLE_PRIVATE_KEY_FILE || path.join(config.orchestratorHome, '.ssh', 'deploy_key');
const SSH_USER = config.infra.deployUser || 'deploy';
const SSH_OPTS = ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];

// Only allow safe characters in paths and patterns to prevent shell injection.
const SAFE_PATH_RE = /^[a-zA-Z0-9_.\-\/]+$/;
const SAFE_PATTERN_RE = /^[a-zA-Z0-9_.\-*?]+$/;
const SAFE_HOST_RE = /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/;

function validatePath(p) {
  if (!p || !SAFE_PATH_RE.test(p)) throw new Error(`Invalid path: ${p}`);
}
function validatePattern(p) {
  if (!p || !SAFE_PATTERN_RE.test(p)) throw new Error(`Invalid pattern: ${p}`);
}
function validateHost(h) {
  if (!h || !SAFE_HOST_RE.test(h)) throw new Error(`Invalid host: ${h}`);
}

/**
 * List files in a remote directory matching a glob pattern.
 * Returns array of { name, size, modified } sorted newest-first.
 */
function listFiles(host, remotePath, pattern = '*') {
  validateHost(host);
  validatePath(remotePath);
  validatePattern(pattern);
  const cmd = `find ${remotePath} -maxdepth 1 -name '${pattern}' -type f -printf '%f\\t%s\\t%T@\\n' 2>/dev/null | sort -t$'\\t' -k3 -rn`;

  return new Promise((resolve, reject) => {
    const proc = spawn('ssh', [
      '-i', SSH_KEY, ...SSH_OPTS,
      `${SSH_USER}@${host}`,
      cmd,
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout) {
        return reject(new Error(`SSH list failed (code ${code}): ${stderr.trim()}`));
      }
      const files = stdout.split('\n').filter(Boolean).map((line) => {
        const [name, sizeStr, modStr] = line.split('\t');
        return { name, size: parseInt(sizeStr, 10), modified: parseFloat(modStr) };
      });
      resolve(files);
    });

    proc.on('error', (err) => reject(new Error(`SSH connection failed: ${err.message}`)));
    setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('SSH list timed out')); }, 15000);
  });
}

/**
 * Get file size of a remote file (for Content-Length header).
 * Returns size in bytes, or null if file doesn't exist.
 */
function statFile(host, remotePath) {
  validateHost(host);
  validatePath(remotePath);
  const cmd = `stat -c '%s' '${remotePath}' 2>/dev/null`;

  return new Promise((resolve, reject) => {
    const proc = spawn('ssh', [
      '-i', SSH_KEY, ...SSH_OPTS,
      `${SSH_USER}@${host}`,
      cmd,
    ]);

    let stdout = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk; });

    proc.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const size = parseInt(stdout.trim(), 10);
      resolve(isNaN(size) ? null : size);
    });

    proc.on('error', (err) => reject(new Error(`SSH stat failed: ${err.message}`)));
    setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('SSH stat timed out')); }, 10000);
  });
}

/**
 * Stream a remote file to a writable stream (e.g., Express response).
 * Returns a handle with kill() to abort.
 */
function streamFile(host, remotePath, writableStream) {
  validateHost(host);
  validatePath(remotePath);
  const proc = spawn('ssh', [
    '-i', SSH_KEY, ...SSH_OPTS,
    `${SSH_USER}@${host}`,
    `cat '${remotePath}'`,
  ]);

  logger.info('ssh-file', `Streaming ${remotePath} from ${host} (pid ${proc.pid})`);

  proc.stdout.pipe(writableStream);

  proc.stderr.on('data', (chunk) => {
    logger.warn('ssh-file', `stderr: ${chunk.toString().trim()}`);
  });

  proc.on('close', (code) => {
    logger.info('ssh-file', `Stream ended for ${remotePath}@${host} (code ${code})`);
    if (!writableStream.writableEnded) {
      try { writableStream.end(); } catch { /* ignore */ }
    }
  });

  proc.on('error', (err) => {
    logger.error('ssh-file', `Stream error: ${err.message}`);
    if (!writableStream.writableEnded) {
      try { writableStream.end(); } catch { /* ignore */ }
    }
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

/**
 * SCP a local file to a remote host.
 */
function uploadFile(localPath, host, remotePath) {
  validateHost(host);
  validatePath(localPath);
  validatePath(remotePath);
  return new Promise((resolve, reject) => {
    const proc = spawn('scp', [
      '-i', SSH_KEY, ...SSH_OPTS,
      localPath,
      `${SSH_USER}@${host}:${remotePath}`,
    ]);

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`SCP failed (code ${code}): ${stderr.trim()}`));
      resolve();
    });

    proc.on('error', (err) => reject(new Error(`SCP error: ${err.message}`)));
  });
}

module.exports = { listFiles, statFile, streamFile, uploadFile };
