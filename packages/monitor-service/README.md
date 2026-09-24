# monitor-service

Prometheus exporter that scrapes important Solana accounts and programs (vault balances, epoch state, treasury totals, cranker balances, expected-vs-actual rewards) and publishes them as metrics. Grafana/Alertmanager consume these to page us when something drifts from the expected state.

## Deployments

Deployed as **solana-monitor**. Image: `public.ecr.aws/v0j6k5v6/solana-monitor`.

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/solana-monitor.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/solana-monitor.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/solana-monitor.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/solana-monitor.yaml) |

Image release: the service auto-tag bot pushes `docker-web-solana-monitor-<version>` on each merge to `develop` that changes it. Push the tag by hand for a hotfix, a minor, or a major (see [repo README](../../README.md#deploying-docker-services)). The service deploy (the k8s bump) stays manual.
