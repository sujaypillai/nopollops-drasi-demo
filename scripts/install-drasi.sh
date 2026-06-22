#!/usr/bin/env bash
set -euo pipefail

if ! command -v drasi >/dev/null 2>&1; then
  echo "Install the Drasi CLI first: https://drasi.io/" >&2
  exit 1
fi

drasi init
kubectl get pods -n drasi-system

