# account-postgres-sink-service

Subscribes to Solana account changes (via streamingfast) and sinks decoded Anchor account data into Postgres. Downstream services (helium-vote-service, blockchain-api, etc) read from the Postgres tables this service populates.

This service comes with a `/refresh-accounts` endpoint that you can use to reset state if streamingfast misses something. This uses a getProgramAccounts and deserializes all accounts and upserts them. Note that this is a heavy operation, and for something like helium-entity-manager that has millions of accounts it can really bog down the postgres. It is not recommended to do this unless something is clearly missing.

Configured by a JSON list of programs/accounts to track. See the deployed `configs` key in the k8s manifests for real-world examples.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/account-postgres-sink-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/account-postgres-sink-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/account-postgres-sink-service.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/account-postgres-sink-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/account-postgres-sink-service.yaml) |
| oracle-cluster / prod | [manifests/oracle-cluster/prod/helium/account-postgres-sink-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/prod/helium/account-postgres-sink-service.yaml) |
| oracle-cluster / sdlc | [manifests/oracle-cluster/sdlc/helium/account-postgres-sink-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/sdlc/helium/account-postgres-sink-service.yaml) |

Deploy: push a `docker-web-account-postgres-sink-service-<version>` git tag (see the [repo README](../../README.md#deploying-docker-services)).
