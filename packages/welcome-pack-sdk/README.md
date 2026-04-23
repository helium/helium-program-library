# @helium/welcome-pack-sdk

TypeScript SDK for the [welcome-pack program](../../programs/welcome-pack), which distributes a one-time token bundle to newly-onboarded wallets (HNT dust + a hotspot claim code, etc.).

## Usage

```ts
import { init } from "@helium/welcome-pack-sdk"
import { AnchorProvider } from "@coral-xyz/anchor"

const program = await init(AnchorProvider.env())
```
