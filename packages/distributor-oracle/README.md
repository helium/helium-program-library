# distributor-oracle

Oracle server for the [lazy-distributor program](../../programs/lazy-distributor). Answers `GET /?mint=<hotspot>` with the current rewards amount and signs `POST /` transactions that set+claim rewards after validating the rewards amount it's being asked to attest to.

See the [main README's Oracle Architecture](../../README.md#oracle-architecture) section for the full protocol.

## Deployments

Image: `public.ecr.aws/s2o4r1i6/distributor-oracle` (note: this one lives in the **oracle** ECR, not the shared web ECR).

Each Helium subnet runs its own instance of this oracle:

| Cluster / env | Manifest |
| --- | --- |
| oracle-cluster / prod — iot | [iot-oracle.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/prod/helium/iot-oracle.yaml) |
| oracle-cluster / prod — mobile | [mobile-oracle.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/prod/helium/mobile-oracle.yaml) |
| oracle-cluster / prod — hnt | [hnt-oracle.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/prod/helium/hnt-oracle.yaml) |
| oracle-cluster / sdlc — iot | [iot-oracle.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/sdlc/helium/iot-oracle.yaml) |
| oracle-cluster / sdlc — mobile | [mobile-oracle.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/sdlc/helium/mobile-oracle.yaml) |
| oracle-cluster / sdlc — hnt | [hnt-oracle.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/oracle-cluster/sdlc/helium/hnt-oracle.yaml) |

Image release: the service auto-tag bot pushes `docker-oracle-distributor-oracle-<version>` on each merge to `develop` that changes it. Push the tag by hand for a hotfix, a minor, or a major (see [repo README](../../README.md#deploying-docker-services)). The service deploy (the k8s bump) stays manual.
