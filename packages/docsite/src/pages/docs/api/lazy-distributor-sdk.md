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

### dummy_ix

#### Accounts

| Name    | Mutability | Signer | Docs |
| ------- | ---------- | ------ | ---- |
| dummy   | immut      | no     |      |
| dummy_2 | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_compression_recipient_v0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| payer               | immut      | no     |      |
| lazy_distributor    | immut      | no     |      |
| recipient           | immut      | no     |      |
| merkle_tree         | immut      | no     |      |
| owner               | immut      | no     |      |
| delegate            | immut      | no     |      |
| compression_program | immut      | no     |      |
| system_program      | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_lazy_distributor_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| lazy_distributor         | immut      | no     |      |
| rewards_mint             | immut      | no     |      |
| rewards_escrow           | immut      | no     |      |
| circuit_breaker          | immut      | no     |      |
| system_program           | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| circuit_breaker_program  | immut      | no     |      |
| token_program            | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_recipient_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| payer            | immut      | no     |      |
| lazy_distributor | immut      | no     |      |
| recipient        | immut      | no     |      |
| mint             | immut      | no     |      |
| target_metadata  | immut      | no     |      |
| system_program   | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### set_current_rewards_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| payer            | immut      | no     |      |
| lazy_distributor | immut      | no     |      |
| recipient        | immut      | no     |      |
| oracle           | immut      | no     |      |
| system_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### set_current_rewards_v1

#### Accounts

| Name                | Mutability | Signer | Docs                                                                                                                                                   |
| ------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| payer               | immut      | no     |                                                                                                                                                        |
| lazy_distributor    | immut      | no     |                                                                                                                                                        |
| recipient           | immut      | no     |                                                                                                                                                        |
| sysvar_instructions | immut      | no     | the supplied Sysvar could be anything else. The Instruction Sysvar has not been implemented in the Anchor framework yet, so this is the safe approach. |
| system_program      | immut      | no     |                                                                                                                                                        |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### temp_close_recipient_v0

#### Accounts

| Name                  | Mutability | Signer | Docs                                                                               |
| --------------------- | ---------- | ------ | ---------------------------------------------------------------------------------- |
| authority             | immut      | no     |                                                                                    |
| rewards_oracle_signer | immut      | no     | Rewards oracle PDA signer - ensures this can only be called through rewards-oracle |
| lazy_distributor      | immut      | no     |                                                                                    |
| recipient             | immut      | no     |                                                                                    |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### temp_update_matching_destination

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| authority          | immut      | no     |      |
| original_recipient | immut      | no     |      |
| recipient          | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### update_compression_destination_v0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| recipient           | immut      | no     |      |
| owner               | immut      | no     |      |
| destination         | immut      | no     |      |
| merkle_tree         | immut      | no     |      |
| compression_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_destination_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| recipient              | immut      | no     |      |
| owner                  | immut      | no     |      |
| destination            | immut      | no     |      |
| recipient_mint_account | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### update_lazy_distributor_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| lazy_distributor | immut      | no     |      |
| rewards_mint     | immut      | no     |      |
| authority        | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

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

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

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

### WindowedCircuitBreakerConfigV0

| Field               | Type            |
| ------------------- | --------------- |
| window_size_seconds | u64             |
| threshold_type      | [object Object] |
| threshold           | u64             |
