---
"@helium/blockchain-api-service": patch
---

Gate data-only issue and onboard on the rent the cluster charges: issue now requires the KeyToAssetV0 rent plus the stored tree fee, onboard the IoT or mobile hotspot info rent, on top of transaction fees.

Insufficient-SOL errors on hotspot info updates, delegation, reward claims and token transfers now say the balance must cover account rent as well as transaction fees.

`getRentLamports` now rejects, and does not cache, a rent of 0 from an RPC error body; the request fails instead of pricing rent at 0 for an hour.
