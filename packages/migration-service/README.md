# migration-service

Drives the HNT-L1 → Solana migration. At migration time it loads `export.json` (snapshot of every L1 account), converts accounts/hotspots/makers into Solana state, commits it via [`@helium/lazy-transactions-sdk`](../lazy-transactions-sdk), and exposes a REST API that wallets call to resolve a migration claim for their keys.

See [`helium-admin-cli`](../helium-admin-cli#migration-quick-reference) for how the encrypted keypair bundle is produced.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/migration-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/migration-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/migration-service.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/migration-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/migration-service.yaml) |

Image release: the service auto-tag bot pushes `docker-web-migration-service-<version>` on each merge to `develop` that changes it. Push the tag by hand for a hotfix, a minor, or a major (see [repo README](../../README.md#deploying-docker-services)). The service deploy (the k8s bump) stays manual.
