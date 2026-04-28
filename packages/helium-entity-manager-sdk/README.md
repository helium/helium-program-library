# @helium/helium-entity-manager-sdk

TypeScript SDK for the [helium-entity-manager program](../../programs/helium-entity-manager). Issues IoT / MOBILE / Data-Only hotspot entities, manages Makers and their Maker Approvals, and builds the asserts (location, gain, elevation) that produce rewardable entities.

```ts
import { init } from "@helium/helium-entity-manager-sdk"
const program = await init(provider)
```
