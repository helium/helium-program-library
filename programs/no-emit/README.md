# no-emit

Burns HNT that was meant to be emitted but forfeited (e.g. rewards for an entity the DAO refuses to pay), and records the amount burned per mint so `helium-sub-daos` can keep total supply accounting honest.

SDK: [`@helium/no-emit-sdk`](../../packages/no-emit-sdk).

Release / upgrade: add a program changeset that names `no-emit` in [`.changeset-programs/`](../../.changeset-programs). After the change reaches `master`, push the `program-no-emit-<version>` tag by hand. The tag's run opens the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
