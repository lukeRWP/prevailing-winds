terraform {
  required_version = ">= 1.5.0, < 2.0.0"
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.95"
    }
    unifi = {
      source  = "filipowm/unifi"
      version = "~> 1.0"
    }
  }
}
