# Cluster-level security groups — only managed from the shared workspace.
# Environment workspaces reference existing groups by their deterministic names.

module "security" {
  source           = "./modules/security"
  count            = var.manage_cluster_resources ? 1 : 0
  app_name         = var.app_name
  internal_cidr    = "10.0.5.0/24"
  workstation_cidr = "10.0.87.0/24"
  remote_cidr      = "10.0.27.0/24"
  env_cidrs = {
    mgmt = "10.0.5.0/24"
    dev  = "10.0.100.0/24"
    qa   = "10.0.110.0/24"
    prod = "10.0.120.0/24"
  }
}

locals {
  # Security group names are deterministic — safe to reference without the module.
  # Platform SGs use "pw-" prefix, app SGs use "${var.app_name}-" prefix.
  sg_names = var.manage_cluster_resources ? module.security[0].sg_names : {
    ssh           = "pw-ssh"
    icmp          = "pw-icmp"
    monitoring    = "pw-monitoring"
    vault         = "pw-vault"
    web           = "${var.app_name}-web"
    orchestrator  = "pw-orchestrator"
    egress_base   = "pw-egress-base"
    egress_app    = "${var.app_name}-egress-app"
    egress_client       = "${var.app_name}-egress-client"
    egress_orchestrator = "pw-egress-orchestrator"
    egress_runner       = "pw-egress-runner"
    # Per-environment groups
    app_env = {
      mgmt = "${var.app_name}-app-mgmt"
      dev  = "${var.app_name}-app-dev"
      qa   = "${var.app_name}-app-qa"
      prod = "${var.app_name}-app-prod"
    }
    db_env = {
      mgmt = "${var.app_name}-db-mgmt"
      dev  = "${var.app_name}-db-dev"
      qa   = "${var.app_name}-db-qa"
      prod = "${var.app_name}-db-prod"
    }
    minio_env = {
      mgmt = "${var.app_name}-minio-mgmt"
      dev  = "${var.app_name}-minio-dev"
      qa   = "${var.app_name}-minio-qa"
      prod = "${var.app_name}-minio-prod"
    }
  }
}
