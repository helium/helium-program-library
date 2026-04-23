# price-oracle

Helium's own on-chain price oracle. A whitelisted set of oracle keys each submit a price; the program stores the median as the canonical price. This was used before we had Pyth.

SDK: [`@helium/price-oracle-sdk`](../../packages/price-oracle-sdk).

Release / upgrade: push a `program-price-oracle-<version>` git tag.
