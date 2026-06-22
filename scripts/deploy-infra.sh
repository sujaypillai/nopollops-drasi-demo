#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../infra/terraform"

if [ ! -f terraform.tfvars ]; then
  cp terraform.tfvars.example terraform.tfvars
  echo "Created infra/terraform/terraform.tfvars. Edit postgres_admin_password before rerunning." >&2
  exit 1
fi

terraform init
terraform apply

terraform output

