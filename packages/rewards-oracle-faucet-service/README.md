# rewards-oracle-faucet-service

A service deployed in devnet that allows you to bump the devnet rewards for a given hotspot, useful for testing rewards claims.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/rewards-oracle-faucet-service`

One deployment per subnet (sdlc only — prod oracles are topped up by a different path):

| Cluster / env | Manifest |
| --- | --- |
| oracle-cluster / sdlc — iot | [iot-rewards-faucet.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/sdlc/helium/iot-rewards-faucet.yaml) |
| oracle-cluster / sdlc — mobile | [mobile-rewards-faucet.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/sdlc/helium/mobile-rewards-faucet.yaml) |
| oracle-cluster / sdlc — hnt | [hnt-rewards-faucet.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/sdlc/helium/hnt-rewards-faucet.yaml) |

Deploy: push a `docker-web-rewards-oracle-faucet-service-<version>` git tag.
