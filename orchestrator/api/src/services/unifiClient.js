const https = require('https');
const vault = require('./vault');
const logger = require('../utils/logger');
const appRegistry = require('./appRegistry');

const CONTEXT = 'unifi';

let cachedCreds = null;

async function getCredentials() {
  if (cachedCreds) return cachedCreds;

  const secrets = await vault.readSecret('secret/data/pw/infra');
  if (!secrets || !secrets.unifi_api_key) {
    throw new Error('UniFi API credentials not found in Vault');
  }

  cachedCreds = {
    apiUrl: (secrets.unifi_api_url || 'https://10.0.5.254').replace(/\/+$/, ''),
    apiKey: secrets.unifi_api_key,
    site: 'default',
  };
  return cachedCreds;
}

async function apiRequest(method, apiPath, body = null) {
  const { apiUrl, apiKey, site } = await getCredentials();
  const url = new URL(`${apiUrl}/proxy/network/api/s/${site}${apiPath}`);

  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method,
    rejectUnauthorized: false,
    headers: {
      'X-API-KEY': apiKey,
    },
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
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed.data || parsed);
          } else {
            reject(new Error(`UniFi API ${method} ${apiPath}: ${parsed.meta?.msg || `HTTP ${res.statusCode}`}`));
          }
        } catch {
          reject(new Error(`UniFi API ${method} ${apiPath}: non-JSON response (${res.statusCode})`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`UniFi API request failed: ${err.message}`)));
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Forget (delete) UniFi client records whose last_ip or fixed_ip matches target IPs.
 * Used during destroy to clean up ghost DHCP lease records that would block
 * future reservations with "FixedIpAlreadyUsedByClient".
 */
async function forgetClientsByIPs(targetIPs) {
  const clients = await apiRequest('GET', '/rest/user');
  const targetSet = new Set(targetIPs);
  const toForget = [];

  for (const client of clients) {
    const ip = client.fixed_ip || client.last_ip || '';
    if (targetSet.has(ip)) {
      toForget.push(client.mac);
    }
  }

  if (toForget.length === 0) {
    logger.info(CONTEXT, `No ghost clients found for IPs: ${targetIPs.join(', ')}`);
    return { forgotten: 0 };
  }

  logger.info(CONTEXT, `Forgetting ${toForget.length} ghost clients for IPs: ${targetIPs.join(', ')}`);
  await apiRequest('POST', '/cmd/stamgr', { cmd: 'forget-sta', macs: toForget });
  logger.info(CONTEXT, `Forgot ${toForget.length} clients: ${toForget.join(', ')}`);

  return { forgotten: toForget.length };
}

/**
 * Clean up all UniFi ghost clients for an app environment.
 * Collects all IPs (internal + external) from the manifest and forgets matching clients.
 */
async function cleanupEnvironmentClients(appName, envName) {
  const envConfig = appRegistry.getEnvironment(appName, envName);
  if (!envConfig) return { forgotten: 0 };

  const hosts = envConfig.hosts || {};
  const targetIPs = [];
  for (const hostCfg of Object.values(hosts)) {
    if (hostCfg.ip) targetIPs.push(hostCfg.ip);
    if (hostCfg.externalIp) targetIPs.push(hostCfg.externalIp);
  }

  if (targetIPs.length === 0) return { forgotten: 0 };

  return forgetClientsByIPs(targetIPs);
}

module.exports = {
  forgetClientsByIPs,
  cleanupEnvironmentClients,
};
