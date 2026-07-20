# geocoder-service

Helium-operated deployment of [Komoot's Photon](https://photon.komoot.io/) geocoder. Powers location search in Helium apps (e.g. asserting a hotspot's address → lat/long). Mostly this is used in wallet-app

The container is a thin wrapper around the upstream `photon` jar — see Photon's docs for the query API.

## Search

```
http://localhost:8000/api?q=berlin
```

For full query options see the [Photon GitHub repo](https://github.com/komoot/photon).

## Deployments

Image: `public.ecr.aws/v0j6k5v6/geocoder-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/geocoder-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/geocoder-service.yaml) |

Deploy: push a `docker-web-geocoder-service-<version>` git tag.

## FAQ

- **How do I pass arguments to `photon.jar`?** The entrypoint forwards args — invoke via `docker exec`.
- **Do I need Nominatim?** No. The container downloads the latest prebuilt search index at startup.
