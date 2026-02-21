#!/bin/bash
# ---------------------------------------------------------------------------
# setup-terraform-backend.sh
# Creates the S3 bucket and DynamoDB table required for Terraform remote state.
# Run this ONCE before `terraform init -migrate-state`.
# ---------------------------------------------------------------------------
set -euo pipefail

BUCKET_NAME="${TF_STATE_BUCKET:-pw-terraform-state}"
REGION="${AWS_REGION:-us-east-1}"
TABLE_NAME="${TF_LOCK_TABLE:-pw-terraform-locks}"

echo "==> Creating S3 bucket '${BUCKET_NAME}' in ${REGION}..."
if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
  echo "    Bucket already exists, skipping creation."
else
  # us-east-1 does not accept a LocationConstraint
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket \
      --bucket "$BUCKET_NAME" \
      --region "$REGION"
  else
    aws s3api create-bucket \
      --bucket "$BUCKET_NAME" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
fi

echo "==> Enabling versioning..."
aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

echo "==> Enabling server-side encryption (aws:kms)..."
aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms"
      },
      "BucketKeyEnabled": true
    }]
  }'

echo "==> Blocking all public access..."
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration '{
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": true,
    "RestrictPublicBuckets": true
  }'

echo "==> Creating DynamoDB table '${TABLE_NAME}' for state locking..."
if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "    Table already exists, skipping creation."
else
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"

  echo "    Waiting for table to become active..."
  aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"
fi

echo ""
echo "==> Done. Remote state backend is ready."
echo "    Next steps:"
echo "      cd terraform"
echo "      terraform init -migrate-state"
