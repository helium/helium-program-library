# dc-auto-top

Lets a user pre-authorise automatic HNT → Data Credit top-ups when their DC balance drops below a configured threshold. The top-up transactions themselves are executed by the [tuktuk](https://github.com/helium/tuktuk) cranker via [`hpl-crons`](../hpl-crons).

Note that there's a cron running in hpl-crons tuktuk called `pyth-hnt` that updates the HNT price.

SDK: [`@helium/dc-auto-top-sdk`](../../packages/dc-auto-top-sdk).

Release / upgrade: push a `program-dc-auto-top-<version>` git tag.
