# helium-vote-service

REST API that aggregates Helium governance state for heliumvote.com — proposals, per-proposal voting power, delegations, proxy assignments, and voter turnout. Reads from the Postgres tables populated by [`account-postgres-sink-service`](../account-postgres-sink-service) and enriches with Dune Analytics data.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/helium-vote-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/helium-vote-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/helium-vote-service.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/helium-vote-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/helium-vote-service.yaml) |

Deploy: push a `docker-web-helium-vote-service-<version>` git tag.
