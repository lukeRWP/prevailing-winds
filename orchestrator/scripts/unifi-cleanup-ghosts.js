#!/usr/bin/env node
/**
 * Clean up ghost UniFi client records (DHCP lease entries) for specific IPs.
 * Called between terraform apply retries to prevent "FixedIpAlreadyUsedByClient".
 *
 * Usage: node unifi-cleanup-ghosts.js 10.0.100.10 10.0.100.11 ...
 *
 * Reads UniFi credentials from environment:
 *   TF_VAR_unifi_api_url  (default: https://10.0.5.254)
 *   TF_VAR_unifi_api_key
 */
const https = require('https');

const targetIPs = new Set(process.argv.slice(2));
if (targetIPs.size === 0) {
  console.log('[unifi-cleanup] No IPs specified, skipping');
  process.exit(0);
}

const apiUrl = (process.env.TF_VAR_unifi_api_url || 'https://10.0.5.254').replace(/\/+$/, '');
const apiKey = process.env.TF_VAR_unifi_api_key;

if (!apiKey) {
  console.error('[unifi-cleanup] TF_VAR_unifi_api_key not set, skipping');
  process.exit(0);
}

function request(method, path, body) {
  const url = new URL(`${apiUrl}/proxy/network/api/s/default${path}`);
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method,
    rejectUnauthorized: false,
    headers: { 'X-API-KEY': apiKey },
  };

  const payload = body ? JSON.stringify(body) : null;
  if (payload) {
    options.headers['Content-Type'] = 'application/json';
    options.headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Non-JSON response (${res.statusCode})`));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  try {
    console.log(`[unifi-cleanup] Cleaning ghost clients for IPs: ${[...targetIPs].join(', ')}`);

    const resp = await request('GET', '/rest/user');
    const clients = resp.data || [];
    const toForget = [];

    for (const client of clients) {
      const ip = client.fixed_ip || client.last_ip || '';
      if (targetIPs.has(ip)) {
        toForget.push(client.mac);
      }
    }

    if (toForget.length === 0) {
      console.log('[unifi-cleanup] No ghost clients found');
      process.exit(0);
    }

    console.log(`[unifi-cleanup] Forgetting ${toForget.length} clients: ${toForget.join(', ')}`);
    await request('POST', '/cmd/stamgr', { cmd: 'forget-sta', macs: toForget });
    console.log('[unifi-cleanup] Done');
  } catch (err) {
    console.error(`[unifi-cleanup] Warning: ${err.message}`);
    // Don't fail the build — cleanup is best-effort
  }
})();
