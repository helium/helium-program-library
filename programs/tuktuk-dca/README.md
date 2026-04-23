# tuktuk-dca

Stores recurring DCA swap intents ("swap X of token A into token B every N hours, for K cycles"). Each cycle, the tuktuk cranker hits [`tuktuk-dca-service`](../../packages/tuktuk-dca-service) to build a Jupiter swap and submits it.

This is no longer used, but was used while we were doing HM revenue burns. It may be used again in the future.

SDK: [`@helium/tuktuk-dca-sdk`](../../packages/tuktuk-dca-sdk).

Release / upgrade: push a `program-tuktuk-dca-<version>` git tag.
