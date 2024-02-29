# Price Oracle SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializePriceOracleV0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| priceOracle   | mut        | yes    |      |
| payer         | mut        | yes    |      |
| systemProgram | immut      | no     |      |

#### Args

| Name | Type                        | Docs |
| ---- | --------------------------- | ---- |
| args | InitializePriceOracleArgsV0 |      |

### updatePriceOracleV0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| priceOracle   | mut        | no     |      |
| authority     | mut        | yes    |      |
| systemProgram | immut      | no     |      |

#### Args

| Name | Type                    | Docs |
| ---- | ----------------------- | ---- |
| args | UpdatePriceOracleArgsV0 |      |

### submitPriceV0

#### Accounts

| Name        | Mutability | Signer | Docs |
| ----------- | ---------- | ------ | ---- |
| priceOracle | mut        | no     |      |
| oracle      | immut      | yes    |      |

#### Args

| Name | Type              | Docs |
| ---- | ----------------- | ---- |
| args | SubmitPriceArgsV0 |      |

### updatePriceV0

#### Accounts

| Name        | Mutability | Signer | Docs |
| ----------- | ---------- | ------ | ---- |
| priceOracle | mut        | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### PriceOracleV0

| Field                   | Type      |
| ----------------------- | --------- |
| authority               | publicKey |
| numOracles              | u8        |
| decimals                | u8        |
| oracles                 | OracleV0  |
| currentPrice            | u64       |
| lastCalculatedTimestamp | i64       |

## Types

### InitializePriceOracleArgsV0

| Field     | Type      |
| --------- | --------- |
| oracles   | OracleV0  |
| decimals  | u8        |
| authority | publicKey |

### SubmitPriceArgsV0

| Field       | Type |
| ----------- | ---- |
| oracleIndex | u8   |
| price       | u64  |

### UpdatePriceOracleArgsV0

| Field     | Type            |
| --------- | --------------- |
| oracles   | [object Object] |
| authority | publicKey       |

### OracleV0

| Field                  | Type      |
| ---------------------- | --------- |
| authority              | publicKey |
| lastSubmittedTimestamp | i64       |
| lastSubmittedPrice     | u64       |
