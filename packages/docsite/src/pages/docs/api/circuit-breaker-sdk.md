# Circuit Breaker SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### burn_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| from            | immut      | no     |      |
| owner           | immut      | no     |      |
| mint            | immut      | no     |      |
| circuit_breaker | immut      | no     |      |
| token_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_account_windowed_breaker_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| payer           | immut      | no     |      |
| circuit_breaker | immut      | no     |      |
| token_account   | immut      | no     |      |
| owner           | immut      | no     |      |
| token_program   | immut      | no     |      |
| system_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_mint_windowed_breaker_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| payer           | immut      | no     |      |
| circuit_breaker | immut      | no     |      |
| mint            | immut      | no     |      |
| mint_authority  | immut      | no     |      |
| token_program   | immut      | no     |      |
| system_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### mint_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| mint            | immut      | no     |      |
| to              | immut      | no     |      |
| mint_authority  | immut      | no     |      |
| circuit_breaker | immut      | no     |      |
| token_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### remove_mint_authority_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| rent_refund     | immut      | no     |      |
| mint            | immut      | no     |      |
| authority       | immut      | no     |      |
| circuit_breaker | immut      | no     |      |
| token_program   | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### transfer_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| from            | immut      | no     |      |
| to              | immut      | no     |      |
| owner           | immut      | no     |      |
| circuit_breaker | immut      | no     |      |
| token_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_account_windowed_breaker_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| circuit_breaker | immut      | no     |      |
| authority       | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_mint_windowed_breaker_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| authority       | immut      | no     |      |
| circuit_breaker | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### AccountWindowedCircuitBreakerV0

undefined

### MintWindowedCircuitBreakerV0

undefined

## Types

### AccountWindowedCircuitBreakerV0

| Field         | Type            |
| ------------- | --------------- |
| token_account | pubkey          |
| authority     | pubkey          |
| owner         | pubkey          |
| config        | [object Object] |
| last_window   | [object Object] |
| bump_seed     | u8              |

### BurnArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### InitializeAccountWindowedBreakerArgsV0

| Field     | Type            |
| --------- | --------------- |
| authority | pubkey          |
| owner     | pubkey          |
| config    | [object Object] |

### InitializeMintWindowedBreakerArgsV0

| Field          | Type            |
| -------------- | --------------- |
| authority      | pubkey          |
| mint_authority | pubkey          |
| config         | [object Object] |

### MintArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### MintWindowedCircuitBreakerV0

| Field          | Type            |
| -------------- | --------------- |
| mint           | pubkey          |
| authority      | pubkey          |
| mint_authority | pubkey          |
| config         | [object Object] |
| last_window    | [object Object] |
| bump_seed      | u8              |

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### TransferArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### UpdateAccountWindowedBreakerArgsV0

| Field         | Type            |
| ------------- | --------------- |
| new_authority | pubkey          |
| config        | [object Object] |

### UpdateMintWindowedBreakerArgsV0

| Field         | Type            |
| ------------- | --------------- |
| new_authority | pubkey          |
| config        | [object Object] |

### WindowV0

| Field                 | Type |
| --------------------- | ---- |
| last_aggregated_value | u64  |
| last_unix_timestamp   | i64  |

### WindowedCircuitBreakerConfigV0

| Field               | Type            |
| ------------------- | --------------- |
| window_size_seconds | u64             |
| threshold_type      | [object Object] |
| threshold           | u64             |
