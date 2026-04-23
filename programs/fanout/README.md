# fanout

Splits revenue that lands in a shared token account across holders of pro-rata membership NFTs. Holders can stake HNT to mint voucher NFTs, collect distributions against their voucher, and burn the voucher to withdraw their stake.

Used for multi-party revenue splits where each participant's share is transferable. For small, fixed splits prefer the cheaper [mini-fanout](../mini-fanout).

SDK: [`@helium/fanout-sdk`](../../packages/fanout-sdk). Metadata: [`fanout-metadata-service`](../../packages/fanout-metadata-service).

Release / upgrade: push a `program-fanout-<version>` git tag.

Note that this isn't actively used (at least by helium) anymore since HST went away.