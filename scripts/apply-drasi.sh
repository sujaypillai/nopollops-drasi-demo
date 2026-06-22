#!/usr/bin/env bash
set -euo pipefail

drasi apply -f drasi/sources.yaml
drasi apply -f drasi/queries/risky-running-workloads.yaml
drasi apply -f drasi/queries/affected-teams.yaml
drasi apply -f drasi/reactions/http-reaction.yaml

