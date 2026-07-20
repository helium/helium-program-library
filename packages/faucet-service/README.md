# faucet-service

Devnet-only faucet that drips HNT, MOBILE, IOT, and DC to a requested wallet. Not deployed to prod — testnet tokens only.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/faucet-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/faucet.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/faucet.yaml) |

Deploy: push a `docker-web-faucet-service-<version>` git tag.
