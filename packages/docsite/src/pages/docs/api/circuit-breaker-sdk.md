# Circuit Breaker SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeMintWindowedBreakerV0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| payer          | mut        | yes    |      |
| circuitBreaker | mut        | no     |      |
| mint           | mut        | no     |      |
| mintAuthority  | immut      | yes    |      |
| tokenProgram   | immut      | no     |      |
| systemProgram  | immut      | no     |      |

#### Args

| Name | Type                                | Docs |
| ---- | ----------------------------------- | ---- |
| args | InitializeMintWindowedBreakerArgsV0 |      |

### initializeAccountWindowedBreakerV0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| payer          | mut        | yes    |      |
| circuitBreaker | mut        | no     |      |
| tokenAccount   | mut        | no     |      |
| owner          | immut      | yes    |      |
| tokenProgram   | immut      | no     |      |
| systemProgram  | immut      | no     |      |

#### Args

| Name | Type                                   | Docs |
| ---- | -------------------------------------- | ---- |
| args | InitializeAccountWindowedBreakerArgsV0 |      |

### mintV0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| mint           | mut        | no     |      |
| to             | mut        | no     |      |
| mintAuthority  | immut      | yes    |      |
| circuitBreaker | mut        | no     |      |
| tokenProgram   | immut      | no     |      |

#### Args

| Name | Type       | Docs |
| ---- | ---------- | ---- |
| args | MintArgsV0 |      |

### transferV0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| from           | mut        | no     |      |
| to             | mut        | no     |      |
| owner          | immut      | yes    |      |
| circuitBreaker | mut        | no     |      |
| tokenProgram   | immut      | no     |      |

#### Args

| Name | Type           | Docs |
| ---- | -------------- | ---- |
| args | TransferArgsV0 |      |

### updateAccountWindowedBreakerV0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| circuitBreaker | mut        | no     |      |
| authority      | immut      | yes    |      |

#### Args

| Name | Type                               | Docs |
| ---- | ---------------------------------- | ---- |
| args | UpdateAccountWindowedBreakerArgsV0 |      |

### updateMintWindowedBreakerV0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| authority      | immut      | yes    |      |
| circuitBreaker | mut        | no     |      |

#### Args

| Name | Type                            | Docs |
| ---- | ------------------------------- | ---- |
| args | UpdateMintWindowedBreakerArgsV0 |      |

## Accounts

### MintWindowedCircuitBreakerV0

| Field         | Type                           |
| ------------- | ------------------------------ |
| mint          | publicKey                      |
| authority     | publicKey                      |
| mintAuthority | publicKey                      |
| config        | WindowedCircuitBreakerConfigV0 |
| lastWindow    | WindowV0                       |
| bumpSeed      | u8                             |

### AccountWindowedCircuitBreakerV0

| Field        | Type                           |
| ------------ | ------------------------------ |
| tokenAccount | publicKey                      |
| authority    | publicKey                      |
| owner        | publicKey                      |
| config       | WindowedCircuitBreakerConfigV0 |
| lastWindow   | WindowV0                       |
| bumpSeed     | u8                             |

## Types

### InitializeAccountWindowedBreakerArgsV0

| Field     | Type                           |
| --------- | ------------------------------ |
| authority | publicKey                      |
| owner     | publicKey                      |
| config    | WindowedCircuitBreakerConfigV0 |

### InitializeMintWindowedBreakerArgsV0

| Field         | Type                           |
| ------------- | ------------------------------ |
| authority     | publicKey                      |
| mintAuthority | publicKey                      |
| config        | WindowedCircuitBreakerConfigV0 |

### MintArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### TransferArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### UpdateAccountWindowedBreakerArgsV0

| Field        | Type            |
| ------------ | --------------- |
| newAuthority | publicKey       |
| config       | [object Object] |

### UpdateMintWindowedBreakerArgsV0

| Field        | Type            |
| ------------ | --------------- |
| newAuthority | publicKey       |
| config       | [object Object] |

### WindowV0

| Field               | Type |
| ------------------- | ---- |
| lastAggregatedValue | u64  |
| lastUnixTimestamp   | i64  |

### WindowedCircuitBreakerConfigV0

| Field             | Type          |
| ----------------- | ------------- |
| windowSizeSeconds | u64           |
| thresholdType     | ThresholdType |
| threshold         | u64           |

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |
