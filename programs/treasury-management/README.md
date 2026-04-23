# treasury-management

Runs a bonding-curve AMM between a sub-DAO's DNT (MOBILE, IOT) and HNT. Hotspot earners exit their DNT into HNT through this program; the curve shape is set by the DAO and caps the rate at which sub-DAO treasuries are drained. It is not recommended to use a non-constant curve as slippage issues have not been fully addressed. The original bonding curve came from Strata, so this is very old code. If you need a new bonding curve, it is better to look for new best practices.

SDK: [`@helium/treasury-management-sdk`](../../packages/treasury-management-sdk).

Release / upgrade: push a `program-treasury-management-<version>` git tag.
