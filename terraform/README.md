# Terraform Infrastructure for RWA Marketplace

Defines AWS infrastructure using Terraform for reproducible deployments.

## Resources

- **VPC** — Isolated network with public/private subnets across 2 AZs
- **NAT Gateway** — Outbound internet for private resources
- **Security Groups** — Backend API (port 3001) and RDS PostgreSQL (port 5432)
- **RDS PostgreSQL** — Managed PostgreSQL 16 with automated backups
- **EC2** — Backend API server with auto-start via systemd
- **Elastic IP** — Static public IP for the backend
- **DynamoDB** — State-lock table for the S3 backend (Issue #571)

## State Locking (Issue #571)

Terraform state is stored in an S3 bucket and **locked with DynamoDB** so that
concurrent `plan`/`apply` runs from different machines or CI jobs cannot
corrupt the shared state. Locking is enforced by:

- `aws_dynamodb_table.terraform_locks` in [`state-lock.tf`](./state-lock.tf) —
  an on-demand (`PAY_PER_REQUEST`) table named `rwa-marketplace-terraform-locks`
  with a `LockID` string hash key (the schema Terraform expects).
- `dynamodb_table = "rwa-marketplace-terraform-locks"` in
  [`backend.tf`](./backend.tf), which tells the S3 backend to acquire a lock
  in that table on every state operation.

### Bootstrap (first run only)

The DynamoDB lock table is itself defined in the Terraform config, so it must
be created before the S3 backend can use it. Do this once per AWS account:

```bash
# 1. Initialize with a temporary local backend so we can create the table
terraform init -backend=false

# 2. Create only the DynamoDB lock table (needs AWS credentials)
terraform apply -target=aws_dynamodb_table.terraform_locks -auto-approve

# 3. Re-initialize with the real S3 + DynamoDB backend
terraform init \
  -backend-config="bucket=rwa-marketplace-terraform-state" \
  -backend-config="key=rwa-marketplace/staging/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -reconfigure
```

> **Note:** the S3 bucket itself (`rwa-marketplace-terraform-state`) is
> provisioned out-of-band (console or a small bootstrap config) since the
> backend cannot reference resources it manages.

From then on, every `terraform plan` / `terraform apply` automatically takes a
lock on the DynamoDB table. If another run holds the lock you will see
`Error: Error acquiring the state lock` — wait for it to finish or remove a
stale lock entry manually from the `LockID` column.

## Usage

### Prerequisites

- Terraform >= 1.6
- AWS credentials configured (env vars, `~/.aws/credentials`, or IAM role)

### Quick Start

```bash
# Initialize with S3 backend (recommended for teams) — enables state locking
terraform init \
  -backend-config="bucket=rwa-marketplace-terraform-state" \
  -backend-config="key=rwa-marketplace/staging/terraform.tfstate" \
  -backend-config="region=us-east-1"

# Or use local state (single developer, no locking)
terraform init -backend=false
```

```bash
# Set required variables
export TF_VAR_rds_username="dbadmin"
export TF_VAR_rds_password="<secure-password>"
export TF_VAR_ssh_key_name="my-key-pair"

# Preview changes
terraform plan -out=tfplan

# Apply
terraform apply tfplan

# Destroy (when no longer needed)
terraform destroy
```

### Variables

| Variable               | Default       | Description                          |
|------------------------|---------------|--------------------------------------|
| `aws_region`           | `us-east-1`   | AWS region                           |
| `environment`          | `staging`     | Environment name (staging/production)|
| `vpc_cidr`             | `10.0.0.0/16` | VPC CIDR block                       |
| `backend_instance_type`| `t3.small`    | Backend EC2 instance type            |
| `rds_instance_class`   | `db.t3.micro` | RDS instance class                   |
| `rds_allocated_storage`| `20`          | RDS storage in GB                    |

### Outputs

After apply, key outputs are printed:

- `backend_public_ip` — Connect your frontend or custom domain
- `rds_endpoint` — Database connection string hostname
- `vpc_id` — VPC identifier

## Production Checklist

1. S3 backend with DynamoDB state locking is configured (see above)
2. Set `deletion_protection = true` on RDS
3. Use a CI/CD pipeline (GitHub Actions) for `terraform plan/apply`
4. Store secrets in AWS Secrets Manager or Parameter Store
5. Add a CDN (CloudFront) in front of the backend
6. Configure a custom domain with Route 53 + ACM certificate
