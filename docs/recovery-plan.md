# System Recovery & CI/CD Activation Plan

> Written 2026-02-23. Blocked on physical console access to Proxmox nodes.
> Once access is restored, follow these steps in order.

---

## Phase 0: Proxmox Recovery (Physical Console Required)

### 0.1 Disable cluster firewall from console

On **either** Proxmox node (prx001 or prx002), at the physical console:

```bash
# Option A: Stop firewall entirely (immediate relief)
pve-firewall stop

# Option B: Set policy to ACCEPT (keeps firewall running but open)
pvesh set /cluster/firewall/options --policy_in ACCEPT
```

### 0.2 Verify management access is restored

From a machine on VLAN 87 (10.0.5.0/24) or primary LAN (10.0.1.0/24):

```bash
# SSH to both nodes
ssh root@10.0.5.88    # prx002
ssh root@10.0.1.169   # prx001

# Web UI
curl -sk https://10.0.5.88:8006  # Should return HTML

# Verify orchestrator VM is running
qm status 112
```

### 0.3 Verify all VMs are running

```bash
qm list | grep -E "imp|vault|runner"
```

Expected: VMs 107-112 running (dev env: 107=db, 109=client, 110=minio, 111=server, 112=orchestrator).

---

## Phase 1: Deploy Fixed Orchestrator Code

The orchestrator (VM 112) still has **old code** from before the cluster firewall fix. Commit `f9bb612` (cluster-level firewall rules) and subsequent commits need to be deployed.

### 1.1 Deploy orchestrator via qm guest exec

```bash
qm guest exec 112 -- bash -c \
  'export HOME=/opt/orchestrator && cd /opt/orchestrator/pw-repo && git pull origin master && bash scripts/deploy-orchestrator.sh'
```

### 1.2 Verify orchestrator is healthy

```bash
curl -sf http://10.0.5.42:8500/health | jq .
```

### 1.3 Verify the new self-update endpoint works

```bash
curl -sf http://10.0.5.42:8500/api/_y_/self/update \
  -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" | jq .
```

---

## Phase 2: Apply Infrastructure Changes

### 2.1 Apply shared infrastructure (cluster firewall rules)

This creates the cluster-level firewall rules that allow SSH, web UI, ICMP, and Corosync to the Proxmox nodes.

```bash
curl -X POST http://10.0.5.42:8500/api/_y_/apps/imp/infra/apply/shared \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**Wait for success**, then verify:
```bash
# SSH to Proxmox should still work after rules are applied
ssh root@10.0.5.88
# Web UI should still respond
curl -sk https://10.0.5.88:8006
```

### 2.2 Re-enable cluster firewall (if stopped in 0.1)

If you used `pve-firewall stop` in Phase 0:

```bash
# On Proxmox node:
pve-firewall start
```

Verify SSH/web UI still work through the firewall with the new rules.

### 2.3 Apply dev environment infrastructure

```bash
curl -X POST http://10.0.5.42:8500/api/_y_/apps/imp/envs/dev/infra/apply \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

This applies:
- VM-level `output_policy=DROP` (egress via security groups)
- `ipfilter=true` (IP spoofing prevention)
- Removal of VLAN 7 NIC from server VM
- Updated security groups (SSH restricted to management)

### 2.4 Provision dev environment (Ansible changes)

```bash
curl -X POST http://10.0.5.42:8500/api/_y_/apps/imp/envs/dev/provision \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

This applies:
- Lock ubuntu user, remove cloud-init sudoers
- Restrict UFW SSH to management CIDR
- Bind node exporter to internal IP

### 2.5 Verify dev environment health

```bash
# Health check
curl http://10.0.100.11:2727/health/live

# All services reachable from management
for ip in 10.0.100.10 10.0.100.11 10.0.100.12 10.0.100.13; do
  echo "=== $ip ==="
  ssh deploy@$ip hostname
done
```

---

## Phase 3: Configure GitHub Secrets for PW Repo

The new PW CI/deploy workflows need GitHub secrets/variables configured.

### 3.1 Set PW repo secrets

Go to https://github.com/lukeRWP/prevailing-winds/settings/secrets/actions or use gh CLI:

```bash
cd /path/to/prevailing-winds

# Required for deploy workflow
gh secret set ORCHESTRATOR_API_KEY --body "$ADMIN_TOKEN"

# Optional: Slack notifications on deploy failure
gh secret set SLACK_WEBHOOK_URL --body "$SLACK_WEBHOOK"
```

### 3.2 Set PW repo variables

```bash
gh variable set ORCHESTRATOR_URL --body "http://10.0.5.42:8500"
```

### 3.3 Verify IMP repo secrets are set

Ensure the IMP repo has these configured:
```bash
cd /path/to/Expansions-Management

# Check existing
gh secret list
gh variable list

# Should have:
# Secrets: ORCHESTRATOR_API_KEY, SLACK_WEBHOOK_URL, NPM_ARTIFACTORY_TOKEN (if needed)
# Variables: ORCHESTRATOR_URL, DEV_API_URL, PROD_API_URL
```

---

## Phase 4: Test CI/CD Workflows

### 4.1 Test PW CI workflow

Create a test PR in prevailing-winds:

```bash
cd prevailing-winds
git checkout -b test/ci-validation
echo "# test" >> README.md
git add README.md && git commit -m "test: verify CI workflow"
git push -u origin test/ci-validation
gh pr create --title "test: CI validation" --body "Testing new CI workflow"
```

Verify these jobs run:
- [ ] `terraform-validate` — fmt check + validate on all modules
- [ ] `ansible-lint` — playbook syntax check
- [ ] `orchestrator-check` — npm install + startup verification

Then close the PR:
```bash
gh pr close test/ci-validation --delete-branch
```

### 4.2 Test PW deploy workflow

Push a trivial change to master:

```bash
git checkout master
# (the CI/deploy workflows themselves are the change)
git push origin master
```

Verify:
- [ ] Deploy workflow triggers on push to master
- [ ] Self-update endpoint is called successfully
- [ ] Orchestrator restarts and becomes healthy
- [ ] Health check passes

### 4.3 Test IMP release workflow

Create a test tag:

```bash
cd Expansions-Management
git tag v0.0.1-test
git push origin v0.0.1-test
```

Verify:
- [ ] Release workflow triggers
- [ ] GitHub Release is created with artifacts
- [ ] QA deploy triggers (no approval required)
- [ ] Prod deploy waits for approval
- [ ] Slack notifications fire for all environments

Then clean up:
```bash
git push origin --delete v0.0.1-test
gh release delete v0.0.1-test --yes
```

---

## Phase 5: Future Improvements (Post-Recovery)

### 5.1 Artifact Promotion (High Value, Medium Effort)

**Problem**: CI builds artifacts, but the orchestrator rebuilds from git. The tested code != deployed code.

**Solution**: Have CI upload build artifacts to MinIO, orchestrator downloads instead of rebuilding.

Steps:
1. Create MinIO bucket: `imp-artifacts`
2. In `build.yml`: After tarball creation, upload to MinIO:
   ```bash
   aws s3 cp imp-client.tar.gz s3://imp-artifacts/${{ github.sha }}/imp-client.tar.gz \
     --endpoint-url http://10.0.100.13:9000
   ```
3. In `executor.js`: Before building tarballs, check if artifacts exist for the ref:
   ```javascript
   const artifactUrl = `s3://imp-artifacts/${ref}/`;
   // If artifacts found, download and skip build
   ```
4. This ensures what CI tested is exactly what gets deployed.

### 5.2 Add Test Infrastructure (High Value, High Effort)

**Problem**: No unit tests, integration tests, or E2E tests.

Steps:
1. Add Jest to server (`npm install --save-dev jest`)
2. Start with repository unit tests (pure functions, no DB)
3. Add API integration tests using supertest
4. Add `npm test` script to package.json
5. Add test job to CI workflow

### 5.3 Add ESLint (Medium Value, Low Effort)

Steps:
1. `cd server && npx eslint --init`
2. `cd client && npx eslint --init`
3. Add `lint` script to both package.json files
4. Add lint job to CI workflow
5. Fix initial lint errors (may be many)

### 5.4 Ansible-lint Configuration (Low Value, Low Effort)

Create `ansible/.ansible-lint` config to customize rules:
```yaml
skip_list:
  - yaml[truthy]    # Ansible uses yes/no which triggers this
  - name[casing]    # Mixed casing in task names
warn_list:
  - experimental
```

### 5.5 Deployment Metrics Dashboard

Track DORA metrics:
- Deploy frequency (from orchestrator operations table)
- Lead time for changes (commit timestamp → deploy success)
- Failure rate (failed/total deploys per period)
- Mean time to recovery (failure → next success)

The orchestrator already has `duration_ms` and `initiated_by` columns. Add a dashboard endpoint or integrate with Grafana.

---

## Checklist Summary

### Immediate (Phase 0-2)
- [ ] Physical console access to Proxmox
- [ ] Disable/fix cluster firewall
- [ ] Deploy orchestrator code (f9bb612+)
- [ ] Apply shared infra (cluster firewall rules)
- [ ] Re-enable cluster firewall
- [ ] Apply dev infra changes
- [ ] Provision dev (Ansible hardening)
- [ ] Verify dev environment health

### CI/CD Activation (Phase 3-4)
- [ ] Set PW GitHub secrets (ORCHESTRATOR_API_KEY)
- [ ] Set PW GitHub variables (ORCHESTRATOR_URL)
- [ ] Verify IMP GitHub secrets are complete
- [ ] Test PW CI workflow on PR
- [ ] Test PW deploy workflow on push
- [ ] Test IMP release workflow with test tag
- [ ] Clean up test artifacts

### Future (Phase 5)
- [ ] Artifact promotion (CI → MinIO → orchestrator)
- [ ] Test infrastructure (Jest + supertest)
- [ ] ESLint for both client and server
- [ ] Ansible-lint configuration
- [ ] DORA metrics dashboard
