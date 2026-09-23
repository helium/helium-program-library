# tuktuk-dca

Stores recurring DCA swap intents ("swap X of token A into token B every N hours, for K cycles"). Each cycle, the tuktuk cranker hits [`tuktuk-dca-service`](../../packages/tuktuk-dca-service) to build a Jupiter swap and submits it.

This is no longer used, but was used while we were doing HM revenue burns. It may be used again in the future.

SDK: [`@helium/tuktuk-dca-sdk`](../../packages/tuktuk-dca-sdk).

Release / upgrade: add a program changeset that names `tuktuk-dca` in [`.changeset-programs/`](../../.changeset-programs). After the change reaches `master`, push the `program-tuktuk-dca-<version>` tag by hand. The tag's run opens the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
