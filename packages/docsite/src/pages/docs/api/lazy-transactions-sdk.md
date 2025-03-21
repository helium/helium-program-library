# Lazy Transactions SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### close_canopy_v0

#### Accounts

| Name              | Mutability | Signer | Docs |
| ----------------- | ---------- | ------ | ---- |
| refund            | immut      | no     |      |
| authority         | immut      | no     |      |
| lazy_transactions | immut      | no     |      |
| canopy            | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### close_marker_v0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| refund                | immut      | no     |      |
| lazy_transactions     | immut      | no     |      |
| authority             | immut      | no     |      |
| block                 | immut      | no     |      |
| executed_transactions | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### execute_transaction_v0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| payer                 | immut      | no     |      |
| lazy_transactions     | immut      | no     |      |
| canopy                | immut      | no     |      |
| lazy_signer           | immut      | no     |      |
| block                 | immut      | no     |      |
| system_program        | immut      | no     |      |
| executed_transactions | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_lazy_transactions_v0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| payer                 | immut      | no     |      |
| lazy_transactions     | immut      | no     |      |
| canopy                | immut      | no     |      |
| executed_transactions | immut      | no     |      |
| system_program        | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### set_canopy_v0

#### Accounts

| Name              | Mutability | Signer | Docs |
| ----------------- | ---------- | ------ | ---- |
| authority         | immut      | no     |      |
| lazy_transactions | immut      | no     |      |
| canopy            | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_lazy_transactions_v0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| authority             | immut      | no     |      |
| lazy_transactions     | immut      | no     |      |
| canopy                | immut      | no     |      |
| executed_transactions | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### Block

undefined

### LazyTransactionsV0

undefined

## Types

### Block

| Field | Type |
| ----- | ---- |

### CloseMarkerArgsV0

| Field | Type |
| ----- | ---- |
| index | u32  |

### CompiledInstruction

| Field            | Type  |
| ---------------- | ----- |
| program_id_index | u8    |
| accounts         | bytes |
| data             | bytes |

### ExecuteTransactionArgsV0

| Field        | Type            |
| ------------ | --------------- |
| instructions | [object Object] |
| signer_seeds | bytes           |
| index        | u32             |

### InitializeLazyTransactionsArgsV0

| Field     | Type            |
| --------- | --------------- |
| root      | [object Object] |
| name      | string          |
| authority | pubkey          |
| max_depth | u32             |

### LazyTransactionsV0

| Field                 | Type            |
| --------------------- | --------------- |
| root                  | [object Object] |
| name                  | string          |
| max_depth             | u32             |
| authority             | pubkey          |
| canopy                | pubkey          |
| bump_seed             | u8              |
| executed_transactions | pubkey          |

### SetCanopyArgsV0

| Field  | Type  |
| ------ | ----- |
| offset | u32   |
| bytes  | bytes |

### UpdateLazyTransactionsArgsV0

| Field     | Type            |
| --------- | --------------- |
| root      | [object Object] |
| authority | pubkey          |
