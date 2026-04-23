# welcome-pack

Distributes a one-time onboarding bundle to new wallets — typically a small HNT/SOL balance plus a hotspot-claim entitlement — committed via a [`lazy-transactions`](../lazy-transactions) Merkle root so creators only pay to publish the root, not per-recipient.

SDK: [`@helium/welcome-pack-sdk`](../../packages/welcome-pack-sdk).

Release / upgrade: push a `program-welcome-pack-<version>` git tag.
