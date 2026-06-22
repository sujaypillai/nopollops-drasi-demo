#!/usr/bin/env bash
set -euo pipefail

kubectl delete deployment -n nopollops-demo -l app.kubernetes.io/part-of=nopollops --ignore-not-found
echo "Demo Kubernetes workloads reset. Reset PostgreSQL state from the operator console or database migration tooling."

