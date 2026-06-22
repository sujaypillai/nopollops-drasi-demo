#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_HOST:?Set POSTGRES_HOST}"
: "${POSTGRES_USER:?Set POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}"

tmp_sources="$(mktemp)"
sed \
  -e "s#\${POSTGRES_HOST}#$POSTGRES_HOST#g" \
  -e "s#\${POSTGRES_USER}#$POSTGRES_USER#g" \
  -e "s#\${POSTGRES_PASSWORD}#$POSTGRES_PASSWORD#g" \
  drasi/sources.yaml > "$tmp_sources"

drasi apply -f "$tmp_sources"
drasi apply -f drasi/queries/risky-running-workloads.yaml
drasi apply -f drasi/queries/affected-teams.yaml
drasi apply -f drasi/reactions/http-reaction.yaml

rm -f "$tmp_sources"
