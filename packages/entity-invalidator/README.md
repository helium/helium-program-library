# entity-invalidator

Listens for Helium entity (hotspot/mobile device) account changes and busts any caches or DAS indexes that reference them, so metadata and ownership views stay fresh instead of waiting for a TTL to expire.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/entity-invalidator`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/entity-invalidator.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/entity-invalidator.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/entity-invalidator.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/entity-invalidator.yaml) |

Deploy: push a `docker-web-entity-invalidator-<version>` git tag.
