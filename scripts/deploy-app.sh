#!/usr/bin/env bash
set -euo pipefail

: "${ACR_NAME:?Set ACR_NAME}"
: "${APP_HOST:?Set APP_HOST}"
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${OPERATOR_KEY:?Set OPERATOR_KEY}"
TAG="${TAG:-$(git rev-parse --short HEAD)}"

kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/api-rbac.yaml

kubectl create secret generic nopollops-config \
  -n nopollops-system \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=OPERATOR_KEY="$OPERATOR_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

sed \
  -e "s#REPLACE_ACR.azurecr.io/nopollops-api:latest#$ACR_NAME.azurecr.io/nopollops-api:$TAG#g" \
  -e "s#REPLACE_ACR.azurecr.io/nopollops-web:latest#$ACR_NAME.azurecr.io/nopollops-web:$TAG#g" \
  infra/k8s/app.yaml | kubectl apply -f -

sed "s#REPLACE_HOST#$APP_HOST#g" infra/k8s/ingress.yaml | kubectl apply -f -

kubectl rollout status deployment/nopollops-api -n nopollops-system
kubectl rollout status deployment/nopollops-web -n nopollops-system

