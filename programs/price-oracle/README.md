# price-oracle

Helium's own on-chain price oracle. A whitelisted set of oracle keys each submit a price; the program stores the median as the canonical price. This was used before we had Pyth.

SDK: [`@helium/price-oracle-sdk`](../../packages/price-oracle-sdk).

Release / upgrade: add a program changeset that names `price-oracle` in [`.changeset-programs/`](../../.changeset-programs). The bots bump the version, push `program-price-oracle-<version>`, and open the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
