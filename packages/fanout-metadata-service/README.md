# fanout-metadata-service

Serves NFT metadata JSON + rendered images for [fanout](../../programs/fanout) position NFTs. Wallets and explorers hit this endpoint via the NFT's URI field.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/fanout-metadata-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/fanout-metadata.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/fanout-metadata.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/fanout-metadata.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/fanout-metadata.yaml) |

Deploy: push a `docker-web-fanout-metadata-service-<version>` git tag.
