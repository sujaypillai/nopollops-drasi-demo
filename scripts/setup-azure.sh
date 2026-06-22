#!/usr/bin/env bash
set -euo pipefail

SUBSCRIPTION_NAME="${AZURE_SUBSCRIPTION_NAME:-ME-MngEnvMCAP074341-sujaypillai-2}"

az account set --subscription "$SUBSCRIPTION_NAME"
az account show --query "{name:name, tenantId:tenantId}" -o table

echo "Azure context configured. Run scripts/deploy-infra.sh next."

