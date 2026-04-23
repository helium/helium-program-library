# mini-fanout

A rent-optimised cheap fanout:

1. Only works on a single token account.
2. Only supports a finite number of wallets (< 10).

If you're creating a lot of fanouts, it's cheaper to use this than full [fanout](../fanout) or [tuktuk wallet-fanout](https://github.com/helium/tuktuk-fanout/tree/main/programs/wallet-fanout). The primary production use is per-hotspot reward routing (split hotspot earnings between owner, host, maker).

Distributions are cranked by tuktuk via [`hpl-crons`](../hpl-crons). SDK: [`@helium/mini-fanout-sdk`](../../packages/mini-fanout-sdk).

Release / upgrade: push a `program-mini-fanout-<version>` git tag.
