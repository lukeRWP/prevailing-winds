# ---------------------------------------------------------------------------
# Remote State — S3-compatible backend (on-prem MinIO)
# ---------------------------------------------------------------------------
# Prerequisites:
#   1. Create the MinIO bucket: mc mb minio/imp-terraform-state
#   2. Enable object locking: mc retention set --default compliance 30d minio/imp-terraform-state
#   3. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars (MinIO creds)
#   4. Run `terraform init -migrate-state` to move existing local state
# ---------------------------------------------------------------------------

terraform {
  backend "s3" {
    bucket = "imp-terraform-state"
    key    = "imp/terraform.tfstate"
    region = "us-east-1"

    # MinIO S3-compatible endpoint on management VLAN
    endpoints = {
      s3 = "http://10.0.5.43:9000"
    }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    use_path_style              = true
    use_lockfile                = true
  }
}
