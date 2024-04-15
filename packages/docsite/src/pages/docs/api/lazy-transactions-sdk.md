# Lazy Transactions SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeLazyTransactionsV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| payer                | mut        | yes    |      |
| lazyTransactions     | mut        | no     |      |
| canopy               | mut        | no     |      |
| executedTransactions | mut        | no     |      |
| systemProgram        | immut      | no     |      |

#### Args

| Name | Type                             | Docs |
| ---- | -------------------------------- | ---- |
| args | InitializeLazyTransactionsArgsV0 |      |

### executeTransactionV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| payer                | mut        | yes    |      |
| lazyTransactions     | mut        | no     |      |
| canopy               | immut      | no     |      |
| lazySigner           | mut        | no     |      |
| block                | immut      | no     |      |
| systemProgram        | immut      | no     |      |
| executedTransactions | mut        | no     |      |

#### Args

| Name | Type                     | Docs |
| ---- | ------------------------ | ---- |
| args | ExecuteTransactionArgsV0 |      |

### closeMarkerV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| refund               | mut        | no     |      |
| lazyTransactions     | mut        | no     |      |
| authority            | immut      | yes    |      |
| block                | mut        | no     |      |
| executedTransactions | mut        | no     |      |

#### Args

| Name | Type              | Docs |
| ---- | ----------------- | ---- |
| args | CloseMarkerArgsV0 |      |

### closeCanopyV0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| refund           | mut        | no     |      |
| authority        | immut      | yes    |      |
| lazyTransactions | mut        | no     |      |
| canopy           | mut        | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### updateLazyTransactionsV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| authority            | immut      | yes    |      |
| lazyTransactions     | mut        | no     |      |
| canopy               | mut        | no     |      |
| executedTransactions | mut        | no     |      |

#### Args

| Name | Type                         | Docs |
| ---- | ---------------------------- | ---- |
| args | UpdateLazyTransactionsArgsV0 |      |

### setCanopyV0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| authority        | immut      | yes    |      |
| lazyTransactions | mut        | no     |      |
| canopy           | mut        | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | SetCanopyArgsV0 |      |

## Accounts

### LazyTransactionsV0

| Field                | Type            |
| -------------------- | --------------- |
| root                 | [object Object] |
| name                 | string          |
| maxDepth             | u32             |
| authority            | publicKey       |
| canopy               | publicKey       |
| bumpSeed             | u8              |
| executedTransactions | publicKey       |

### Block

| Field | Type |
| ----- | ---- |

## Types

### CloseMarkerArgsV0

| Field | Type |
| ----- | ---- |
| index | u32  |

### CompiledInstruction

| Field          | Type  |
| -------------- | ----- |
| programIdIndex | u8    |
| accounts       | bytes |
| data           | bytes |

### ExecuteTransactionArgsV0

| Field        | Type                |
| ------------ | ------------------- |
| instructions | CompiledInstruction |
| signerSeeds  | bytes               |
| index        | u32                 |

### InitializeLazyTransactionsArgsV0

| Field     | Type            |
| --------- | --------------- |
| root      | [object Object] |
| name      | string          |
| authority | publicKey       |
| maxDepth  | u32             |

### SetCanopyArgsV0

| Field  | Type  |
| ------ | ----- |
| offset | u32   |
| bytes  | bytes |

### UpdateLazyTransactionsArgsV0

| Field     | Type            |
| --------- | --------------- |
| root      | [object Object] |
| authority | publicKey       |
