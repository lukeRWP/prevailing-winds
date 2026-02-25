/**
 * Startup wrapper for the PW Dashboard.
 *
 * Fetches Entra OAuth config from Vault (via orchestrator API) and sets
 * the corresponding process.env vars BEFORE the Next.js server loads.
 * Falls back to env vars from ui.env if the API is unreachable.
 */
const http = require('http');

const VAULT_TO_ENV = {
  microsoft_entra_id_id: 'AUTH_MICROSOFT_ENTRA_ID_ID',
  microsoft_entra_id_secret: 'AUTH_MICROSOFT_ENTRA_ID_SECRET',
  microsoft_entra_id_issuer: 'AUTH_MICROSOFT_ENTRA_ID_ISSUER',
  entra_admin_group_id: 'AUTH_ENTRA_ADMIN_GROUP_ID',
};

function fetchEntraConfig() {
  const apiUrl = process.env.API_URL || 'http://localhost:8500';
  const token = process.env.ADMIN_TOKEN;

  if (!token) {
    console.warn('[start] No ADMIN_TOKEN — skipping Vault-based Entra config');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const req = http.get(`${apiUrl}/api/_x_/entra/config`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.warn(`[start] Entra config endpoint returned ${res.statusCode}`);
          return resolve();
        }
        try {
          const { data } = JSON.parse(body);
          const secrets = data?.secrets || {};
          let loaded = 0;
          for (const [vaultKey, envKey] of Object.entries(VAULT_TO_ENV)) {
            if (secrets[vaultKey]) {
              process.env[envKey] = secrets[vaultKey];
              loaded++;
            }
          }
          console.log(`[start] Loaded ${loaded} Entra config values from Vault`);
        } catch (e) {
          console.warn('[start] Failed to parse Entra config:', e.message);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.warn('[start] Could not fetch Entra config:', e.message);
      resolve();
    });

    req.on('timeout', () => {
      console.warn('[start] Entra config request timed out');
      req.destroy();
      resolve();
    });
  });
}

(async () => {
  await fetchEntraConfig();
  require('../.next/standalone/server.js');
})();
