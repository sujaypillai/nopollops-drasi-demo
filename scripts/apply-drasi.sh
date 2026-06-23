#!/usr/bin/env bash
set -euo pipefail

# Required env:
#   POSTGRES_HOST     - PostgreSQL FQDN (e.g., psql-foo.postgres.database.azure.com)
#   POSTGRES_USER     - PG superuser used by Drasi PG source
#   POSTGRES_PASSWORD - password for POSTGRES_USER
#
# Prerequisites:
#   - Drasi CLI installed and `drasi init` completed
#   - default source/reaction providers registered (drasi-platform 0.10 yamls applied)
#   - PG: wal_level=LOGICAL and POSTGRES_USER has REPLICATION privilege
#   - REPLICA IDENTITY FULL on the 4 published tables (recommended for UPDATE/DELETE)

: "${POSTGRES_HOST:?Set POSTGRES_HOST}"
: "${POSTGRES_USER:?Set POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}"

# 1) Create / refresh PG credentials secret used by sources.yaml
kubectl -n drasi-system create secret generic pg-creds \
  --from-literal=user="$POSTGRES_USER" \
  --from-literal=password="$POSTGRES_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# 2) Build in-cluster kubeconfig for the Kubernetes source
#    Requires the drasi-k8s-reader ServiceAccount + ClusterRoleBinding to be in place.
kubectl -n drasi-system get sa drasi-k8s-reader >/dev/null 2>&1 || cat <<'YAML' | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: drasi-k8s-reader
  namespace: drasi-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: drasi-k8s-reader-view
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: view
subjects:
  - kind: ServiceAccount
    name: drasi-k8s-reader
    namespace: drasi-system
---
apiVersion: v1
kind: Secret
metadata:
  name: drasi-k8s-reader-token
  namespace: drasi-system
  annotations:
    kubernetes.io/service-account.name: drasi-k8s-reader
type: kubernetes.io/service-account-token
YAML

sleep 3
SA_TOKEN=$(kubectl -n drasi-system get secret drasi-k8s-reader-token -o jsonpath='{.data.token}' | base64 -d)
SA_CA=$(kubectl -n drasi-system get secret drasi-k8s-reader-token -o jsonpath='{.data.ca\.crt}')

KCFG=$(cat <<KUBECONFIG
apiVersion: v1
kind: Config
clusters:
- name: in-cluster
  cluster:
    server: https://kubernetes.default.svc
    certificate-authority-data: ${SA_CA}
contexts:
- name: in-cluster
  context:
    cluster: in-cluster
    user: drasi-k8s-reader
current-context: in-cluster
users:
- name: drasi-k8s-reader
  user:
    token: ${SA_TOKEN}
KUBECONFIG
)

kubectl -n drasi-system create secret generic k8s-context \
  --from-literal=context="$KCFG" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3) Substitute POSTGRES_HOST in sources.yaml (user/password come from pg-creds Secret)
tmp_sources="$(mktemp)"
sed "s#\${POSTGRES_HOST}#$POSTGRES_HOST#g" drasi/sources.yaml > "$tmp_sources"

drasi apply -f "$tmp_sources"
drasi apply -f drasi/queries/risky-running-workloads.yaml
drasi apply -f drasi/queries/affected-teams.yaml
drasi apply -f drasi/reactions/http-reaction.yaml

rm -f "$tmp_sources"

echo
echo "Applied. Verify with:"
echo "  drasi list source"
echo "  drasi list query"
echo "  drasi list reaction"
