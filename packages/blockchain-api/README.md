# blockchain-api

Next.js backend that powers the my-helium wallet. Provides balances, transaction history, asset lookups, swap routing and governance endpoints for first-party Helium apps.

A published TypeScript client for this API lives in [`@helium/blockchain-api-client`](../blockchain-api-client).

## Local dev

```sh
pnpm dev
```

## Deployments

Deployed as **my-helium**. Image: `public.ecr.aws/v0j6k5v6/blockchain-api`.

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/my-helium.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/my-helium.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/my-helium.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/my-helium.yaml) |

Image release: the service auto-tag bot pushes `docker-web-blockchain-api-<version>` on each merge to `develop` that changes it. Push the tag by hand for a hotfix, a minor, or a major (see [repo README](../../README.md#deploying-docker-services)). The service deploy (the k8s bump) stays manual.
