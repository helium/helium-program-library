# dc-auto-top

Lets a user pre-authorise automatic HNT → Data Credit top-ups when their DC balance drops below a configured threshold. The top-up transactions themselves are executed by the [tuktuk](https://github.com/helium/tuktuk) cranker via [`hpl-crons`](../hpl-crons).

Note that there's a cron running in hpl-crons tuktuk called `pyth-hnt` that updates the HNT price.

SDK: [`@helium/dc-auto-top-sdk`](../../packages/dc-auto-top-sdk).

Release / upgrade: add a program changeset that names `dc-auto-top` in [`.changeset-programs/`](../../.changeset-programs), and bump `version` in `programs/dc-auto-top/Cargo.toml`. After the change reaches `master`, push the `program-dc-auto-top-<version>` tag by hand. The tag's run opens the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
