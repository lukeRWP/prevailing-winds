#!/bin/bash
# Deploy Prevailing Winds orchestrator to the orchestrator VM
# Run from the Proxmox host: bash deploy-orchestrator.sh
#
# Prerequisites:
#   - SSH access to the orchestrator VM (10.0.5.42)
#   - The PW repo must be cloned on the orchestrator VM
#
# Usage:
#   ssh root@prx002
#   # First time: clone PW repo on the orchestrator VM
#   qm guest exec 112 -- bash -c 'export HOME=/opt/orchestrator && cd /opt/orchestrator && git clone git@github.com:lukeRWP/prevailing-winds.git pw-repo'
#   # Then run this script
#   qm guest exec 112 -- bash -c 'export HOME=/opt/orchestrator && bash /opt/orchestrator/pw-repo/scripts/deploy-orchestrator.sh'

set -euo pipefail

ORCH_HOME="${ORCHESTRATOR_HOME:-/opt/orchestrator}"
PW_REPO="${ORCH_HOME}/pw-repo"
API_DIR="${ORCH_HOME}/api"

echo "=== Deploying Prevailing Winds Orchestrator ==="

# Pull latest
cd "${PW_REPO}"
git pull origin master

# Sync API code
echo "Syncing API code..."
rsync -a --delete \
  --exclude=node_modules \
  --exclude='*.db' \
  --exclude=.env \
  "${PW_REPO}/orchestrator/api/" "${API_DIR}/"

# Install dependencies
echo "Installing npm dependencies..."
cd "${API_DIR}"
npm ci --production 2>&1

# Sync app manifests
echo "Syncing app manifests..."
rsync -a "${PW_REPO}/orchestrator/apps/" "${ORCH_HOME}/apps/"

# Sync ansible directory
echo "Syncing Ansible configs..."
rsync -a --delete "${PW_REPO}/ansible/" "${ORCH_HOME}/ansible/"

# Sync terraform directory
echo "Syncing Terraform configs..."
rsync -a --delete \
  --exclude='.terraform' \
  --exclude='.terraform.lock.hcl' \
  --exclude='*.tfstate*' \
  --exclude='environments/*.tfvars' \
  --exclude='backend.tf' \
  "${PW_REPO}/terraform/" "${ORCH_HOME}/terraform/"

# Deploy S3 backend.tf for MinIO-backed state (matches repo backend but uses management-reachable IP)
# The orchestrator on VLAN 87 reaches MinIO at 10.0.100.13 via cross-VLAN routing.
# AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are set by executor from Vault secrets.
# AWS_CA_BUNDLE is set by executor to trust MinIO's self-signed cert.
cat > "${ORCH_HOME}/terraform/backend.tf" <<'TFEOF'
terraform {
  backend "s3" {
    bucket = "pw-terraform-state"
    key    = "terraform.tfstate"
    region = "us-east-1"

    endpoints = {
      s3 = "https://10.0.100.13:9000"
    }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    use_path_style              = true
    use_lockfile                = true
  }
}
TFEOF
echo "Deployed S3 backend.tf (MinIO-backed state)"

# Migrate existing local state to S3 if local state file exists
if [ -f "${ORCH_HOME}/data/terraform.tfstate" ]; then
  echo "Local state file found — migration to S3 will happen on next terraform init"
fi

# Install Ansible collections
echo "Installing Ansible collections..."
"${ORCH_HOME}/venv/bin/ansible-galaxy" collection install -r "${ORCH_HOME}/ansible/requirements.yml" 2>&1

# Ensure required directories exist
mkdir -p "${ORCH_HOME}/certs" "${ORCH_HOME}/.ansible/tmp"

# Fix ownership
chown -R orchestrator:orchestrator "${API_DIR}" "${ORCH_HOME}/apps" "${ORCH_HOME}/ansible" "${ORCH_HOME}/terraform" "${ORCH_HOME}/certs" "${ORCH_HOME}/.ansible"

# Restart service
echo "Restarting orchestrator service..."
systemctl restart orchestrator

echo "=== Deploy complete ==="
systemctl status orchestrator --no-pager
