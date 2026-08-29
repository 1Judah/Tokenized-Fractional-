terraform {
  backend "s3" {
    # Configured per-environment via backend config or CLI:
    # terraform init \
    #   -backend-config="bucket=rwa-marketplace-terraform-state" \
    #   -backend-config="key=rwa-marketplace/staging/terraform.tfstate" \
    #   -backend-config="region=us-east-1"
    #
    # State locking (Issue #571): the DynamoDB table below is created by
    # terraform/state-lock.tf. Locking prevents concurrent `terraform plan`
    # and `terraform apply` runs from corrupting the shared state file.
    #
    # bucket         = "rwa-marketplace-terraform-state"
    # key            = "rwa-marketplace/staging/terraform.tfstate"
    # region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "rwa-marketplace-terraform-locks"
  }
}
