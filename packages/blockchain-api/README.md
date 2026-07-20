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

Deploy: push a `docker-web-blockchain-api-<version>` git tag.
