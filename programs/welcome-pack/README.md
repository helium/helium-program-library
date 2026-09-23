# welcome-pack

Distributes a one-time onboarding bundle to new wallets — typically a small HNT/SOL balance plus a hotspot-claim entitlement — committed via a [`lazy-transactions`](../lazy-transactions) Merkle root so creators only pay to publish the root, not per-recipient.

SDK: [`@helium/welcome-pack-sdk`](../../packages/welcome-pack-sdk).

Release / upgrade: add a program changeset that names `welcome-pack` in [`.changeset-programs/`](../../.changeset-programs). After the change reaches `master`, push the `program-welcome-pack-<version>` tag by hand. The tag's run opens the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
