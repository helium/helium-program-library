# tokens-to-rent-service

Flash-loans a small amount of SOL for rent, swaps HNT/MOBILE/IOT → SOL via Jupiter, and repays the loan from the swap proceeds in a single atomic transaction. The user ends up with just enough SOL to pay fees even if they only hold Helium tokens.

This is used for the wallet-app feature where we let users top up to 0.02 SOL using IOT/MOBILE/HNT when they're low. If you kill wallet app, you can likely kill this service/feature.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/tokens-to-rent-service` — plus a second `hnt-to-rent-service` deployment that targets HNT specifically (same code, different config).

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod — tokens-to-rent | [tokens-to-rent-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/tokens-to-rent-service.yaml) |
| web-cluster / prod — hnt-to-rent | [hnt-to-rent-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/hnt-to-rent-service.yaml) |
| web-cluster / sdlc — tokens-to-rent | [tokens-to-rent-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/tokens-to-rent-service.yaml) |
| web-cluster / sdlc — hnt-to-rent | [hnt-to-rent-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/hnt-to-rent-service.yaml) |

Deploy: push a `docker-web-tokens-to-rent-service-<version>` git tag.
