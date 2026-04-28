# metadata-service

Serves NFT metadata + rendered images for Helium hotspot entities (IoT, MOBILE, Data-Only). Wallets and explorers hit this service via the cNFT's `uri` field; the image is generated from the hotspot's on-chain state (asserted location, rewards destination, etc.).

## Deployments

Image: `public.ecr.aws/v0j6k5v6/entity-metadata-service` (note the image is named `entity-metadata-service` even though the docker-info key is `entity-metadata-service`; the source directory is `packages/metadata-service`).

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/metadata.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/metadata.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/metadata.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/metadata.yaml) |

Deploy: push a `docker-web-entity-metadata-service-<version>` git tag.
