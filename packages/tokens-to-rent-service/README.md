# tokens-to-rent-service

Flash-loans a small amount of SOL for rent, swaps HNT/MOBILE/IOT → SOL via Jupiter's Swap V2 `GET /swap/v2/build`, and repays the loan from the swap proceeds in a single atomic transaction. The user ends up with just enough SOL to pay fees even if they only hold Helium tokens.

This is used for the wallet-app feature where we let users top up to 0.02 SOL using IOT/MOBILE/HNT when they're low. If you kill wallet app, you can likely kill this service/feature.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `JUPITER_API_URL` | `https://api.jup.ag` | Jupiter API base URL; the service appends `/swap/v2/build`. |
| `JUPITER_API_KEY` | none | Sent as `x-api-key`. Without it, Jupiter applies its keyless rate limit and the service logs a warning at start. |
| `SOLANA_URL` | `http://127.0.0.1:8899` | Solana RPC endpoint. |

`/build` takes the input amount only (ExactIn), has no quote-only form, and returns the compute unit price without a limit. `/estimate` builds a swap of 0.020015 SOL into the token for the platform wallet and reports its output; `/fees` builds the token to SOL swap for the user, bounded with `maxAccounts` for every token and also `maxBytes` for HNT and MOBILE, so the transaction aims to stay within Solana's 1232-byte limit (an estimate from measured routes). IOT uses `maxAccounts` only. It simulates the transaction to set the compute unit limit at 20% over the units used, and refuses the request when the simulation fails. The transaction carries no compute unit price, so the user repays the base fee and the rent loan only. A build whose setup creates any token account besides the user's wrapped SOL account is refused. A build that quotes less than 95% or more than 105% of the 0.020015 SOL is refused. Every request excludes Jupiter RFQ v2, whose fills need a market maker's signature.

Jupiter has no SOL to IOT route, so IOT is priced from its sale. The service builds the IOT to SOL swap of a 43,000 IOT probe, scales the amount to 0.020015 SOL, and builds the scaled amount to verify it. It refuses a verify that pays out more than 105% or less than 95% of 0.020015 SOL. A verify between 95% and 100% is scaled once more from the verify. An IOT `/fees` request makes up to three `/build` calls. No IOT route fits both bounds, so the IOT swap is bounded by `maxAccounts` only. Every `/fees` transaction over 1232 bytes is refused before its simulation.

`/fees` signs one transaction for a wallet and token at a time. While the build is in flight, and for 90 seconds after it resolves, a request for the same wallet and token returns the same signed transaction. A request for another token builds its own transaction. A failed build releases the wallet and token. Each instance of the service keeps this record in its own memory, so the rule holds for each instance.

The service keeps each token's estimate for 15 seconds. `/estimate`, `/estimates` and `/fees` share it, and concurrent requests share one Jupiter call. A failed estimate is not kept.

A failed request answers `{ "error": "<message>" }`. The status is 400 when the request is wrong (a missing or invalid `wallet` or `mint`, a mint the service does not swap, or the platform wallet as the user), 502 when the service refuses Jupiter's answer or Jupiter does not answer in 15 seconds, and 500 for any other failure. The service removes the RPC URL and the Jupiter API key from the message and from its logs.

## Deployments

Image: `public.ecr.aws/v0j6k5v6/tokens-to-rent-service` — plus a second `hnt-to-rent-service` deployment that targets HNT specifically (same code, different config). This package builds only the tokens-to-rent-service image.

| Cluster / env | Manifest |
| --- | --- |
| web-cluster / prod — tokens-to-rent | [tokens-to-rent-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/tokens-to-rent-service.yaml) |
| web-cluster / prod — hnt-to-rent | [hnt-to-rent-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/prod/helium/hnt-to-rent-service.yaml) |
| web-cluster / sdlc — tokens-to-rent | [tokens-to-rent-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/tokens-to-rent-service.yaml) |
| web-cluster / sdlc — hnt-to-rent | [hnt-to-rent-service.yaml](https://github.com/helium/helium-foundation-k8s/blob/master/manifests/web-cluster/sdlc/helium/hnt-to-rent-service.yaml) |

Deploy: push a `docker-web-tokens-to-rent-service-<version>` git tag.
