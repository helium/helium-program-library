# @helium/data-credits-sdk

TypeScript SDK for the [data-credits program](../../programs/data-credits). Data credits are a non-transferable SPL token burned to pay for hotspot data transfer; this SDK builds mint-DC, burn-DC, and HNT-to-DC swap instructions against the HNT price oracle.

```ts
import { init } from "@helium/data-credits-sdk"
const program = await init(provider)
```
