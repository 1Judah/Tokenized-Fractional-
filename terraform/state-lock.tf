# ── Terraform State Locking (Issue #571) ─────────────────────────────────────
# DynamoDB table used by the S3 backend for state locking. Terraform acquires
# a lock row in this table while running `plan`/`apply`, so concurrent runs
# from different machines/CI jobs cannot corrupt the shared state file.
#
# The table name must match `dynamodb_table` in backend.tf (the S3 backend
# does not support variables, so the name is duplicated on purpose).
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "rwa-marketplace-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  # Lock rows are transient; no point paying for point-in-time recovery.
  point_in_time_recovery {
    enabled = false
  }

  tags = merge(local.common_tags, { Name = "rwa-marketplace-terraform-locks" })
}
