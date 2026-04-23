# tuktuk-pyth-service

HTTP endpoint the tuktuk cranker calls when a Pyth price update task fires. Pulls the latest Pyth VAA from Hermes, builds the `post_price_update` transaction for the Pyth receiver, and returns it for the cranker to submit — keeps the HNT price oracle on-chain without a standing process.

This allows us to schedule pyth updates to the chain instead of depending on Pyth to do it (and paying the premium). This is used for dc-auto-topoff, setting the price before that runs.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/tuktuk-pyth-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/tuktuk-pyth-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/tuktuk-pyth-service.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/tuktuk-pyth-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/tuktuk-pyth-service.yaml) |

Deploy: push a `docker-web-tuktuk-pyth-service-<version>` git tag.
