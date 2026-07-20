# @helium/circuit-breaker-sdk

TypeScript SDK for the [circuit-breaker program](../../programs/circuit-breaker). The program wraps `Mint` and `TokenAccount` with configurable windowed rate limits; this SDK exposes helpers to initialise breakers, build mint/transfer CPI instructions, and derive PDAs.

```ts
import { init } from "@helium/circuit-breaker-sdk"
const program = await init(provider)
```
