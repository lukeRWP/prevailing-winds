# Cloud-init snippet — uploaded via lifecycle orchestrator's Proxmox API call.
# The bpg/proxmox provider's file upload uses SSH which can timeout on slow
# connections. The orchestrator handles this reliably via the REST API instead.
#
# Environment workspaces reference the snippet by its known path.

locals {
  cloud_init_snippet_id = "${var.cloud_init_datastore}:snippets/pw-cloud-init-base.yml"
}
