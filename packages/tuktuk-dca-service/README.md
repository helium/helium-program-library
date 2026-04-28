# tuktuk-dca-service

This is no longer used, as we are no longer burning Helium Mobile Revenue

HTTP endpoint the tuktuk cranker calls when it's time to execute a scheduled DCA swap. Fetches a Jupiter Lite quote, builds the swap transaction, wires it into the [tuktuk-dca program](../../programs/tuktuk-dca), signs, and returns it for the cranker to submit.

## Environment

- `SOLANA_URL` — RPC (default `https://api.mainnet-beta.solana.com`)
- `JUPITER_API_URL` — default `https://lite-api.jup.ag`
- `PORT` — default `8123`
- `DCA_SIGNER_SECRET` — base58-encoded signer keypair

## API

```
GET  /health
POST /dca/:dcaKey      body: { task_queue, task, task_queued_at }
```

## Development

```bash
pnpm install
pnpm dev
pnpm build && pnpm start
```

## Deployments

Image: `public.ecr.aws/v0j6k5v6/tuktuk-dca-service`

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod | [manifests/web-cluster/prod/helium/tuktuk-dca-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/tuktuk-dca-service.yaml) |

Deploy: push a `docker-web-tuktuk-dca-service-<version>` git tag.
