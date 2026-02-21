output "vm_ids" {
  description = "Map of VM roles to Proxmox VM IDs"
  value       = module.imp_vms.vm_ids
}

output "mac_addresses" {
  description = "Map of VM roles to MAC addresses (for DHCP reservations)"
  value       = module.imp_vms.mac_addresses
}

output "vm_ips" {
  description = "Map of VM roles to fixed IPs"
  value       = var.environment != "shared" ? var.vm_ips : {}
}

output "vault_vm_id" {
  description = "Vault server VM ID"
  value       = var.deploy_shared ? module.vault[0].vm_id : null
}

output "vault_mac" {
  description = "Vault server MAC address"
  value       = var.deploy_shared ? module.vault[0].mac_address : null
}

output "vault_ip" {
  description = "Vault server fixed IP"
  value       = var.deploy_shared ? var.vault_ip : null
}

output "runner_vm_id" {
  description = "GitHub Actions runner VM ID"
  value       = var.deploy_shared ? module.runner[0].vm_id : null
}

output "runner_mac" {
  description = "GitHub Actions runner MAC address"
  value       = var.deploy_shared ? module.runner[0].mac_address : null
}

output "runner_ip" {
  description = "GitHub Actions runner fixed IP"
  value       = var.deploy_shared ? var.runner_ip : null
}
