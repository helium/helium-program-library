# circuit-breaker

On-chain rate limiter for SPL mints and token accounts. A `MintWindowedCircuitBreaker` / `AccountWindowedCircuitBreaker` wraps a mint/token account and rejects mint or transfer CPIs that would exceed a configured amount per rolling window.

Used as the gate on the HNT, MOBILE, IOT, and DC mints — if any program (including an exploited one) tries to mint more than the DAO-approved rate, the CPI fails. SDK: [`@helium/circuit-breaker-sdk`](../../packages/circuit-breaker-sdk).

Release / upgrade: add a program changeset that names `circuit-breaker` in [`.changeset-programs/`](../../.changeset-programs). The bots bump the version, push `program-circuit-breaker-<version>`, and open the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
