#!/usr/bin/env bash
set -euo pipefail

: "${ACR_NAME:?Set ACR_NAME to your Azure Container Registry name}"
TAG="${TAG:-$(git rev-parse --short HEAD)}"

az acr login --name "$ACR_NAME"
docker build -f apps/api/Dockerfile -t "$ACR_NAME.azurecr.io/nopollops-api:$TAG" .
docker build -f apps/web/Dockerfile -t "$ACR_NAME.azurecr.io/nopollops-web:$TAG" .
docker push "$ACR_NAME.azurecr.io/nopollops-api:$TAG"
docker push "$ACR_NAME.azurecr.io/nopollops-web:$TAG"

echo "Pushed images with tag $TAG"

