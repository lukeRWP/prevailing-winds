provider "proxmox" {
  endpoint  = var.proxmox_api_url
  api_token = var.proxmox_api_token
  # TODO: Set insecure = false once Proxmox has a trusted TLS certificate.
  # Steps: 1) Export CA from /etc/pve/pve-root-ca.pem on Proxmox node
  #         2) Set insecure = false
  #         3) Optionally set: root_ca = file("/path/to/pve-root-ca.pem")
  insecure  = true

  ssh {
    agent    = true
    username = "root"
  }
}

provider "unifi" {
  api_url        = var.unifi_api_url
  api_key        = var.unifi_api_key
  site           = var.unifi_site
  # TODO: Set allow_insecure = false once UDM Pro has a trusted TLS certificate.
  allow_insecure = true
}
