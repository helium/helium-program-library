# Lazy Distributor SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### distribute_compression_rewards_v0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| common              | immut      | no     |      |
| merkle_tree         | immut      | no     |      |
| compression_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### distribute_custom_destination_v0

#### Accounts

| Name   | Mutability | Signer | Docs |
| ------ | ---------- | ------ | ---- |
| common | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### distribute_rewards_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| common                 | immut      | no     |      |
| recipient_mint_account | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### tempUpdateMatchingDestination

#### Accounts

| Name              | Mutability | Signer | Docs |
| ----------------- | ---------- | ------ | ---- |
| authority         | immut      | yes    |      |
| originalRecipient | immut      | no     |      |
| recipient         | mut        | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### AccountWindowedCircuitBreakerV0

undefined

### LazyDistributorV0

undefined

### RecipientV0

undefined

### RemoteTaskTransactionV0

undefined

### SetCurrentRewardsTransactionV0

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

### CompiledInstructionV0

| Field            | Type  |
| ---------------- | ----- |
| program_id_index | u8    |
| accounts         | bytes |
| data             | bytes |

### CompiledTransactionV0

| Field          | Type            |
| -------------- | --------------- |
| num_rw_signers | u8              |
| num_ro_signers | u8              |
| num_rw         | u8              |
| accounts       | pubkey          |
| instructions   | [object Object] |
| signer_seeds   | bytes           |

### DistributeCompressionRewardsArgsV0

| Field        | Type            |
| ------------ | --------------- |
| data_hash    | [object Object] |
| creator_hash | [object Object] |
| root         | [object Object] |
| index        | u32             |

### InitializeCompressionRecipientArgsV0

| Field        | Type            |
| ------------ | --------------- |
| data_hash    | [object Object] |
| creator_hash | [object Object] |
| root         | [object Object] |
| index        | u32             |

### InitializeLazyDistributorArgsV0

| Field         | Type            |
| ------------- | --------------- |
| oracles       | [object Object] |
| authority     | pubkey          |
| window_config | [object Object] |
| approver      | pubkey          |

### LazyDistributorV0

| Field          | Type            |
| -------------- | --------------- |
| version        | u16             |
| rewards_mint   | pubkey          |
| rewards_escrow | pubkey          |
| authority      | pubkey          |
| oracles        | [object Object] |
| bump_seed      | u8              |
| approver       | pubkey          |

### OracleConfigV0

| Field  | Type   |
| ------ | ------ |
| oracle | pubkey |
| url    | string |

### RecipientV0

| Field                  | Type            |
| ---------------------- | --------------- |
| lazy_distributor       | pubkey          |
| asset                  | pubkey          |
| total_rewards          | u64             |
| current_config_version | u16             |
| current_rewards        | [object Object] |
| bump_seed              | u8              |
| reserved               | u64             |
| destination            | pubkey          |

### RemoteTaskTransactionV0

| Field             | Type            |
| ----------------- | --------------- |
| verification_hash | [object Object] |
| transaction       | [object Object] |

### SetCurrentRewardsArgsV0

| Field           | Type |
| --------------- | ---- |
| oracle_index    | u16  |
| current_rewards | u64  |

### SetCurrentRewardsTransactionV0

| Field            | Type   |
| ---------------- | ------ |
| lazy_distributor | pubkey |
| oracle_index     | u16    |
| current_rewards  | u64    |
| asset            | pubkey |

### UpdateCompressionDestinationArgsV0

| Field        | Type            |
| ------------ | --------------- |
| data_hash    | [object Object] |
| creator_hash | [object Object] |
| root         | [object Object] |
| index        | u32             |

### UpdateLazyDistributorArgsV0

| Field     | Type            |
| --------- | --------------- |
| oracles   | [object Object] |
| authority | pubkey          |
| approver  | [object Object] |

### WindowV0

| Field                 | Type |
| --------------------- | ---- |
| last_aggregated_value | u64  |
| last_unix_timestamp   | i64  |

### circuit_breaker::state::ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### circuit_breaker::state::WindowedCircuitBreakerConfigV0

| Field               | Type            |
| ------------------- | --------------- |
| window_size_seconds | u64             |
| threshold_type      | [object Object] |
| threshold           | u64             |

### lazy_distributor::circuit_breaker::ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### lazy_distributor::circuit_breaker::WindowedCircuitBreakerConfigV0

| Field               | Type            |
| ------------------- | --------------- |
| window_size_seconds | u64             |
| threshold_type      | [object Object] |
| threshold           | u64             |
