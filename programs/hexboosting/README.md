# hexboosting

Lets MOBILE / IoT hotspot owners spend DC to buy a temporary rewards-multiplier for a specific hex, for a fixed number of months. Used to incentivise coverage in under-served areas.

Boost configs set the price-per-month and the allowed multiplier schedule; the [`rewards-oracle`](../rewards-oracle) reads active boosts when computing per-hex payouts.

SDK: [`@helium/hexboosting-sdk`](../../packages/hexboosting-sdk).

Release / upgrade: add a program changeset that names `hexboosting` in [`.changeset-programs/`](../../.changeset-programs). After the change reaches `master`, push the `program-hexboosting-<version>` tag by hand. The tag's run opens the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).

This is deprecated, hexboosting is no longer a feature.
