# Cluster-level security groups — only managed from the shared workspace.
# Environment workspaces reference existing groups by their deterministic names.

module "security" {
  source        = "./modules/security"
  count         = var.manage_cluster_resources ? 1 : 0
  internal_cidr = "10.0.5.0/24"
  env_cidrs = {
    mgmt = "10.0.5.0/24"
    dev  = "10.0.100.0/24"
    qa   = "10.0.110.0/24"
    prod = "10.0.120.0/24"
  }
}

locals {
  # Security group names are deterministic — safe to reference without the module.
  # The sg_names map is a mix of flat strings and nested maps for per-env groups.
  sg_names = var.manage_cluster_resources ? module.security[0].sg_names : {
    ssh           = "imp-ssh"
    icmp          = "imp-icmp"
    monitoring    = "imp-monitoring"
    vault         = "imp-vault"
    web           = "imp-web"
    orchestrator  = "imp-orchestrator"
    egress_base   = "imp-egress-base"
    egress_app    = "imp-egress-app"
    egress_client = "imp-egress-client"
    # Per-environment groups
    app_env = {
      mgmt = "imp-app-mgmt"
      dev  = "imp-app-dev"
      qa   = "imp-app-qa"
      prod = "imp-app-prod"
    }
    db_env = {
      mgmt = "imp-db-mgmt"
      dev  = "imp-db-dev"
      qa   = "imp-db-qa"
      prod = "imp-db-prod"
    }
    minio_env = {
      mgmt = "imp-minio-mgmt"
      dev  = "imp-minio-dev"
      qa   = "imp-minio-qa"
      prod = "imp-minio-prod"
    }
  }
}
