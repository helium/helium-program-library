# @helium/account-fetch-cache-hooks

React hooks and a context provider for [`@helium/account-fetch-cache`](../account-fetch-cache). Components that call `useAccount` / `useAccounts` share a single cache and websocket subscription, so multiple components rendering the same account don't duplicate RPC work.

## Usage

```tsx
import { AccountProvider, useAccount } from "@helium/account-fetch-cache-hooks"

<AccountProvider>
  <MyComponent />
</AccountProvider>

function MyComponent() {
  const { info, loading } = useAccount(pubkey, parser)
}
```
