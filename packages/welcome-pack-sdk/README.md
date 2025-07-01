# @helium/welcome-pack-sdk

Interface to the welcome-pack smart contract.

## Installation

```sh
npm install @helium/welcome-pack-sdk
```

## Usage

```ts
import { init } from "@helium/welcome-pack-sdk"
import { AnchorProvider } from "@coral-xyz/anchor"

const provider = AnchorProvider.env()
const program = await init(provider)
```

## License

Apache-2.0 