# vsr-metadata-service

Serves NFT metadata + rendered SVGs for [voter-stake-registry](../../programs/voter-stake-registry) position NFTs. Wallets show "veHNT position, 4y lockup, 12k HNT" etc. via this service's URI.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/vsr-metadata-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/vsr-metadata.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/vsr-metadata.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/vsr-metadata.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/vsr-metadata.yaml) |

Deploy: push a `docker-web-vsr-metadata-service-<version>` git tag.
