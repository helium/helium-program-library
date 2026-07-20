# asset-ownership-service

Tracks ownership of compressed NFTs (Helium hotspots, etc.) in Postgres. Uses StreamingFast substreams to listen for bubblegum transactions for updates to ownership, as well as using DAS to establish initial state.

Similar to account-postgres-sink it has a refresh endpoint (/refresh-owners) to start fresh from DAS if streamingfast missed something.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/asset-ownership-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/asset-ownership-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/asset-ownership-service.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/asset-ownership-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/asset-ownership-service.yaml) |
| oracle-cluster / prod | [manifests/oracle-cluster/prod/helium/asset-ownership-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/prod/helium/asset-ownership-service.yaml) |
| oracle-cluster / sdlc | [manifests/oracle-cluster/sdlc/helium/asset-ownership.service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/sdlc/helium/asset-ownership.service.yaml) |

Deploy: push a `docker-web-asset-ownership-service-<version>` git tag.
