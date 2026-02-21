# ---------------------------------------------------------------------------
# Remote State — S3-compatible backend (on-prem MinIO)
# ---------------------------------------------------------------------------
# Prerequisites:
#   1. Create the MinIO bucket: mc mb minio/pw-terraform-state
#   2. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars (MinIO creds)
#   3. MinIO uses self-signed TLS — set AWS_CA_BUNDLE to the MinIO CA cert:
#        export AWS_CA_BUNDLE=/path/to/minio-public.crt
#   4. Run `terraform init` (or `-migrate-state` if migrating from local state)
# ---------------------------------------------------------------------------

terraform {
  backend "s3" {
    bucket = "pw-terraform-state"
    key    = "terraform.tfstate"
    region = "us-east-1"

    # MinIO S3-compatible endpoint on management VLAN (HTTPS with self-signed cert)
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
