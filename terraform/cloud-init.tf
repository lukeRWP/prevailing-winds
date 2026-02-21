# Cloud-init snippet — only uploaded from the shared workspace.
# Environment workspaces reference the existing snippet by its known path.

resource "proxmox_virtual_environment_file" "cloud_init_base" {
  count        = var.manage_cluster_resources ? 1 : 0
  content_type = "snippets"
  datastore_id = var.cloud_init_datastore
  node_name    = var.target_node

  source_raw {
    data      = file("${path.module}/templates/cloud-init-base.yml")
    file_name = "pw-cloud-init-base.yml"
  }
}

locals {
  cloud_init_snippet_id = var.manage_cluster_resources ? proxmox_virtual_environment_file.cloud_init_base[0].id : "${var.cloud_init_datastore}:snippets/pw-cloud-init-base.yml"
}
