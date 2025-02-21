# Price Oracle SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initialize_price_oracle_v0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| price_oracle   | immut      | no     |      |
| payer          | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### submit_price_v0

#### Accounts

| Name         | Mutability | Signer | Docs |
| ------------ | ---------- | ------ | ---- |
| price_oracle | immut      | no     |      |
| oracle       | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_price_oracle_v0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| price_oracle   | immut      | no     |      |
| authority      | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_price_v0

#### Accounts

| Name         | Mutability | Signer | Docs |
| ------------ | ---------- | ------ | ---- |
| price_oracle | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### PriceOracleV0

undefined

## Types

### InitializePriceOracleArgsV0

| Field     | Type            |
| --------- | --------------- |
| oracles   | [object Object] |
| decimals  | u8              |
| authority | pubkey          |

### OracleV0

| Field                    | Type   |
| ------------------------ | ------ |
| authority                | pubkey |
| last_submitted_timestamp | i64    |
| last_submitted_price     | u64    |

### PriceOracleV0

| Field                     | Type            |
| ------------------------- | --------------- |
| authority                 | pubkey          |
| num_oracles               | u8              |
| decimals                  | u8              |
| oracles                   | [object Object] |
| current_price             | u64             |
| last_calculated_timestamp | i64             |

### SubmitPriceArgsV0

| Field        | Type |
| ------------ | ---- |
| oracle_index | u8   |
| price        | u64  |

### UpdatePriceOracleArgsV0

| Field     | Type            |
| --------- | --------------- |
| oracles   | [object Object] |
| authority | pubkey          |
