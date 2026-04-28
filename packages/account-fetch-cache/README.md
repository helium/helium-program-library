# @helium/account-fetch-cache

A Solana account fetch cache that eliminates redundant RPC reads and batches reads into `getMultipleAccounts` calls. Subscribes to accounts once and keeps the cache in sync using websockets, so repeated reads in the same tick or across components don't re-fetch.

## Usage

```ts
import { AccountFetchCache } from "@helium/account-fetch-cache"

const cache = new AccountFetchCache({ connection, commitment: "confirmed" })
const parsed = await cache.search(pubkey, parser) // parser: (pubkey, account) => T
```

For React, see [`@helium/account-fetch-cache-hooks`](../account-fetch-cache-hooks).
