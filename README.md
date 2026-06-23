# NoPollOps: Drasi Audience Interaction Demo

NoPollOps is a conference demo app for showing how Drasi continuous queries can replace polling-based cloud-native automation.

Audience members join from their phones, submit app deployments, and vote on remediation. The app writes participant and risk catalog state to PostgreSQL and creates bounded demo workloads in AKS. Drasi observes PostgreSQL and Kubernetes, continuously detects risky running workloads, and pushes result changes into a presenter dashboard.

## Demo story

1. Audience joins by QR code.
2. Attendees "deploy" apps with container image tags.
3. The presenter marks an image tag as risky.
4. Drasi joins live Kubernetes state with PostgreSQL risk data.
5. The dashboard updates with risky workloads and affected teams.
6. Audience votes on remediation.
7. The operator applies a fix.
8. Drasi removes the resolved workload from the result set.

## Repository layout

```text
apps/
  api/       Backend API, Kubernetes integration, Drasi reaction receiver
  web/       Audience app, presenter dashboard, operator console
database/   PostgreSQL migrations and demo seed data
drasi/      Source, continuous query, and reaction manifests
infra/      Kubernetes and Azure infrastructure assets
scripts/    Setup, deploy, reset, and preflight scripts
```

## Current status

The repo includes a full first implementation of the demo:

- React frontend for audience, dashboard, and operator flows.
- Node.js API for participants, submissions, risk catalog, votes, remediations, reactions, seeding, and live events.
- PostgreSQL schema and seed data.
- Kubernetes manifests for app deployment on AKS.
- Drasi manifests for PostgreSQL source, Kubernetes source, risky workload query, affected teams query, and HTTP reaction.
- Terraform for AKS Standard, ACR, PostgreSQL Flexible Server, and Log Analytics.
- GitHub Actions for build and AKS deployment.
- Demo runbook, speaker script, troubleshooting notes, and deployment scripts.

## Prerequisites

- Node.js 20+
- Docker
- kubectl
- Azure CLI
- Drasi CLI
- PostgreSQL

## Local development

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The API expects PostgreSQL configuration from environment variables. Copy `.env.example` and adjust values for your local or Azure database.

For local PostgreSQL:

```bash
docker compose up -d postgres
```

## Azure deployment

The intended Azure target is AKS Standard with:

- Azure CNI Overlay
- Workload Identity
- Azure Container Registry
- Azure Database for PostgreSQL Flexible Server
- Azure Key Vault
- Log Analytics / Container Insights
- Drasi installed into `drasi-system`

High-level deployment flow:

```bash
scripts/setup-azure.sh
scripts/deploy-infra.sh
az aks get-credentials -g <resource-group> -n <aks-name>
scripts/build-push.sh
scripts/deploy-app.sh
scripts/install-drasi.sh
scripts/apply-drasi.sh
```

See `docs/demo-runbook.md` for the live conference flow.

### Live deployment

The reference deployment is reachable at **http://20.212.124.116.nip.io** (ingress is the AKS Web App Routing nginx LB; FQDN auto-resolves via nip.io). The Drasi reaction → API → dashboard loop is verified end-to-end: an INSERT into `app_submissions` whose `image` matches an active `risky_images` row produces a `risky-running-workloads`/`affected-teams` continuous-query result that the HTTP reaction posts to `/api/drasi/reactions`, which lands in `reaction_events` and shows up in the dashboard.

### Gotchas worth remembering

- **southeastasia** does not support availability zone `1`; Terraform uses zones `["2","3"]`.
- `Standard_D4s_v5` does **not** support Ephemeral OS disk; node pools use `os_disk_type = "Managed"`. Switch to `Standard_D4ds_v5` if you want ephemeral.
- Azure PostgreSQL Flexible Server requires explicit allow-list for extensions: `az postgres flexible-server parameter set ... azure.extensions=UUID-OSSP`. `wal_level=LOGICAL` requires a server restart; the admin user needs `ALTER ROLE … WITH REPLICATION` for Drasi's PG source.
- Drasi 0.10 does **not** automatically install default Source/Reaction providers; apply them from `drasi-platform/0.10.0/cli/installers/resources/default-{source,reaction}-providers.yaml`.
- Drasi's PostgreSQL source emits Debezium `boolean` columns as strings `"t"`/`"f"` — Cypher queries must compare with `r.active = 't'`, not `r.active = true`.
- Drasi continuous queries **cannot** join across labels via a cartesian `MATCH`; declare an explicit `sources.joins` block and pattern with the synthetic edge (`(a)-[:JOIN_ID]->(b)`).
- The HTTP reaction uses plain Handlebars **with no custom helpers** — there is no `json` helper. Render the JSON body field-by-field rather than `{{json after}}`.
- For UPDATE/DELETE events to carry the full row (needed for many continuous queries), set `REPLICA IDENTITY FULL` on the published tables.
- The Kubernetes source needs an in-cluster kubeconfig (server `https://kubernetes.default.svc` + ServiceAccount token + CA). `az aks get-credentials` style kubeconfigs use exec auth and won't work from inside a pod. `scripts/apply-drasi.sh` builds this automatically.
