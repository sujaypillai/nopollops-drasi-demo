# Troubleshooting

## Dashboard does not update

- Check `kubectl logs deployment/nopollops-api -n nopollops-system`.
- Confirm `/events` is routed to the API service.
- Confirm `reaction_events` rows are being inserted.

## Drasi sources are unavailable

- Confirm PostgreSQL firewall allows Azure services or the AKS egress IP.
- Confirm Kubernetes source secret exists in `drasi-system`.
- Run `drasi list source` and inspect the source status.

## Too many workloads

The API caps real Kubernetes deployments using `MAX_REAL_DEPLOYMENTS`. Extra submissions are recorded as simulated.

## Conference Wi-Fi fails

Use the operator console to seed demo participants and continue presenter-driven.

