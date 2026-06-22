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

This repo starts with the runnable application skeleton and deployment assets. The first implementation slice includes:

- React frontend for audience, dashboard, and operator flows.
- Node.js API contract for participants, submissions, risk catalog, votes, reactions, and live events.
- PostgreSQL schema and seed data.
- Kubernetes manifests for app deployment on AKS.
- Drasi manifests for PostgreSQL source, Kubernetes source, risky workload query, affected teams query, and HTTP reaction.

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
npm run dev
```

The API expects PostgreSQL configuration from environment variables. Copy `.env.example` and adjust values for your local or Azure database.

## Azure deployment

The intended Azure target is AKS Standard with:

- Azure CNI Overlay
- Workload Identity
- Azure Container Registry
- Azure Database for PostgreSQL Flexible Server
- Azure Key Vault
- Log Analytics / Container Insights
- Drasi installed into `drasi-system`

Deployment scripts and infrastructure definitions will be expanded as the implementation progresses.

