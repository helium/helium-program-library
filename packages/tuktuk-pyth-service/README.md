# tuktuk-pyth-service

HTTP endpoint the tuktuk cranker calls when a Pyth price update task fires. Pulls the latest Pyth VAA from Hermes, builds the `post_price_update` transaction for the Pyth receiver, and returns it for the cranker to submit — keeps the HNT price oracle on-chain without a standing process.

This allows us to schedule pyth updates to the chain instead of depending on Pyth to do it (and paying the premium). This is used for dc-auto-topoff, setting the price before that runs.

## Configuration

One codebase runs as either the legacy or the pro Pyth instance, selected purely by env:

| Env var                       | Default                                        | Pro deployment                                      |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `PYTH_HERMES_URL`             | `https://hermes.pyth.network/`                 | `https://pyth.dourolabs.app/hermes/`                |
| `PYTH_API_KEY`                | unset (no auth header)                         | Pyth data-plan key, sent as `Authorization: Bearer` |
| `PYTH_RECEIVER_PROGRAM_ID`    | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`  | `rec2HHDDnjLfj4kE7VyEtFA1HPGQLK33259532cRyHp`       |
| `PYTH_PUSH_ORACLE_PROGRAM_ID` | `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`  | `pyt2F414BA6dPttK6RddPZUdHfapoBN24GL5wbrPCou`       |
| `WORMHOLE_PROGRAM_ID`         | `HDwcJBJXjL9FpJ7UBsYBtaDjsBUhuLCUYoz3zr8SWWaQ` | `HDw2E7P8X1SkCyjvoGsfBGAVUutKcj874bXjHrpVYrVL`      |

With none of these set, behavior is identical to the pre-parameterization service (legacy deployment unaffected).

The baseline update cadence is not a property of this service — it is the schedule on the tuktuk cron job that fires `/v1/write` tasks, set at cron-job registration time (ops runbook). The pro instance's cron must be registered at ≤4 minutes so consumers never hit the 10-minute on-chain staleness window.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/tuktuk-pyth-service`

| Cluster / env      | Manifest                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| web-cluster / prod | [manifests/web-cluster/prod/helium/tuktuk-pyth-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/tuktuk-pyth-service.yaml) |
| web-cluster / sdlc | [manifests/web-cluster/sdlc/helium/tuktuk-pyth-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/tuktuk-pyth-service.yaml) |

Deploy: push a `docker-web-tuktuk-pyth-service-<version>` git tag.
