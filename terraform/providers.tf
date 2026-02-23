provider "proxmox" {
  endpoint  = var.proxmox_api_url
  api_token = var.proxmox_api_token
  insecure  = var.tls_skip_verify

  ssh {
    agent    = true
    username = "root"
  }
}

provider "unifi" {
  api_url        = var.unifi_api_url
  api_key        = var.unifi_api_key
  site           = var.unifi_site
  allow_insecure = var.tls_skip_verify
}
