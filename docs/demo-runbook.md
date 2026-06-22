# NoPollOps demo runbook

## Preflight

1. Open the presenter dashboard at `/dashboard`.
2. Open the operator console at `/operator`.
3. Run `scripts/preflight.sh`.
4. Confirm Drasi sources, queries, and reactions are available.
5. Reset state from the operator console.
6. Seed backup participants if conference Wi-Fi looks weak.

## Live flow

1. Show the QR code / app URL.
2. Ask the audience to join and submit deployments.
3. Show the dashboard filling with apps.
4. Explain the polling problem.
5. In the operator console, mark `ghcr.io/nopollops/payment-api:legacy` risky.
6. Show the risk board and affected teams update.
7. Ask the room to vote on remediation.
8. Apply upgrade to `ghcr.io/nopollops/payment-api:v2`.
9. Resolve the risk signal.
10. Show risky workload count return to zero.

## Backup path

If audience participation fails, use **Seed backup audience** in the operator console. If Drasi reaction delivery fails, use the Debug/Result Reaction as a visual backup and explain the HTTP reaction path.

