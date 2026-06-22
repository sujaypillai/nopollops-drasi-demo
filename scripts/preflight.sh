#!/usr/bin/env bash
set -euo pipefail

for tool in az kubectl docker drasi; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing required tool: $tool" >&2
    exit 1
  fi
done

kubectl get namespace nopollops-system >/dev/null
kubectl get namespace nopollops-demo >/dev/null
drasi list source
drasi list query
drasi list reaction

