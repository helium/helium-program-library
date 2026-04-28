# ecc-sig-verifier

Rust (Rocket) HTTP server that verifies Helium ECC (the hardware security module baked into every hotspot) signatures on transactions before co-signing them. Used by the issuance flow to prove a hotspot's on-device key really authorised the onboarding transaction.

Exposes a `/health` endpoint and signature-verification endpoints consumed by [`helium-entity-manager`](../../programs/helium-entity-manager) issuance flows.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/ecc-verifier`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/ecc-verifier.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/ecc-verifier.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/ecc-verifier.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/ecc-verifier.yaml) |

Deploy: push a `docker-web-ecc-verifier-<version>` git tag.

For generating test signatures locally, see [`../generate-test-gateway-txn`](../generate-test-gateway-txn).
