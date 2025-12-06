# Dc Auto Top SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### close_auto_top_off_v0

#### Accounts

| Name                       | Mutability | Signer | Docs |
| -------------------------- | ---------- | ------ | ---- |
| authority                  | immut      | no     |      |
| auto_top_off               | immut      | no     |      |
| queue_authority            | immut      | no     |      |
| task_queue_authority       | immut      | no     |      |
| rent_refund                | immut      | no     |      |
| task_queue                 | immut      | no     |      |
| next_task                  | immut      | no     |      |
| dao                        | immut      | no     |      |
| hnt_mint                   | immut      | no     |      |
| dca_mint                   | immut      | no     |      |
| hnt_account                | immut      | no     |      |
| authority_hnt_account      | immut      | no     |      |
| dc_account                 | immut      | no     |      |
| dca_mint_account           | immut      | no     |      |
| authority_dca_mint_account | immut      | no     |      |
| next_hnt_task              | immut      | no     |      |
| associated_token_program   | immut      | no     |      |
| token_program              | immut      | no     |      |
| tuktuk_program             | immut      | no     |      |
| system_program             | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### close_legacy_auto_top_off

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| authority                | immut      | no     |      |
| auto_top_off             | immut      | no     |      |
| delegated_data_credits   | immut      | no     |      |
| hnt_account              | immut      | no     |      |
| authority_hnt_account    | immut      | no     |      |
| dc_account               | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| token_program            | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_auto_top_off_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| authority                | immut      | no     |      |
| auto_top_off             | immut      | no     |      |
| hnt_price_oracle         | immut      | no     |      |
| dao                      | immut      | no     |      |
| data_credits             | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| hnt_mint                 | immut      | no     |      |
| delegated_data_credits   | immut      | no     |      |
| dc_account               | immut      | no     |      |
| hnt_account              | immut      | no     |      |
| dca_mint                 | immut      | no     |      |
| dca_mint_account         | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| task_queue               | immut      | no     |      |
| circuit_breaker          | immut      | no     |      |
| queue_authority          | immut      | no     |      |
| system_program           | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| token_program            | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### schedule_task_v0

#### Accounts

| Name                 | Mutability | Signer | Docs                                          |
| -------------------- | ---------- | ------ | --------------------------------------------- |
| payer                | immut      | no     |                                               |
| auto_top_off         | immut      | no     |                                               |
| next_task            | immut      | no     | Only allow one task to be scheduled at a time |
| next_hnt_task        | immut      | no     | Only allow one task to be scheduled at a time |
| queue_authority      | immut      | no     |                                               |
| task_queue_authority | immut      | no     |                                               |
| task_queue           | immut      | no     |                                               |
| task                 | immut      | no     |                                               |
| hnt_task             | immut      | no     |                                               |
| tuktuk_program       | immut      | no     |                                               |
| system_program       | immut      | no     |                                               |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### top_off_dc_v0

#### Accounts

| Name                     | Mutability | Signer | Docs                                                                                                                                                   |
| ------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| auto_top_off             | immut      | no     |                                                                                                                                                        |
| task_queue               | immut      | no     |                                                                                                                                                        |
| delegated_data_credits   | immut      | no     |                                                                                                                                                        |
| data_credits             | immut      | no     |                                                                                                                                                        |
| dc_mint                  | immut      | no     |                                                                                                                                                        |
| hnt_mint                 | immut      | no     |                                                                                                                                                        |
| dao                      | immut      | no     |                                                                                                                                                        |
| sub_dao                  | immut      | no     |                                                                                                                                                        |
| from_account             | immut      | no     |                                                                                                                                                        |
| from_hnt_account         | immut      | no     |                                                                                                                                                        |
| hnt_account              | immut      | no     |                                                                                                                                                        |
| hnt_price_oracle         | immut      | no     |                                                                                                                                                        |
| escrow_account           | immut      | no     |                                                                                                                                                        |
| circuit_breaker          | immut      | no     |                                                                                                                                                        |
| associated_token_program | immut      | no     |                                                                                                                                                        |
| token_program            | immut      | no     |                                                                                                                                                        |
| system_program           | immut      | no     |                                                                                                                                                        |
| circuit_breaker_program  | immut      | no     |                                                                                                                                                        |
| data_credits_program     | immut      | no     |                                                                                                                                                        |
| instruction_sysvar       | immut      | no     | the supplied Sysvar could be anything else. The Instruction Sysvar has not been implemented in the Anchor framework yet, so this is the safe approach. |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### top_off_hnt_v0

#### Accounts

| Name                          | Mutability | Signer | Docs                                                                                                                                                   |
| ----------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| auto_top_off                  | immut      | no     |                                                                                                                                                        |
| task_queue                    | immut      | no     |                                                                                                                                                        |
| hnt_account                   | immut      | no     |                                                                                                                                                        |
| hnt_mint                      | immut      | no     |                                                                                                                                                        |
| dca_mint                      | immut      | no     |                                                                                                                                                        |
| dca_mint_account              | immut      | no     |                                                                                                                                                        |
| dca_input_price_oracle        | immut      | no     |                                                                                                                                                        |
| hnt_price_oracle              | immut      | no     |                                                                                                                                                        |
| dca                           | immut      | no     |                                                                                                                                                        |
| dca_input_account             | immut      | no     |                                                                                                                                                        |
| dca_destination_token_account | immut      | no     |                                                                                                                                                        |
| associated_token_program      | immut      | no     |                                                                                                                                                        |
| token_program                 | immut      | no     |                                                                                                                                                        |
| system_program                | immut      | no     |                                                                                                                                                        |
| tuktuk_dca_program            | immut      | no     |                                                                                                                                                        |
| instruction_sysvar            | immut      | no     | the supplied Sysvar could be anything else. The Instruction Sysvar has not been implemented in the Anchor framework yet, so this is the safe approach. |
| dca_custom_signer             | immut      | no     |                                                                                                                                                        |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### update_auto_top_off_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| authority                | immut      | no     |      |
| payer                    | immut      | no     |      |
| auto_top_off             | immut      | no     |      |
| queue_authority          | immut      | no     |      |
| task_queue_authority     | immut      | no     |      |
| task_queue               | immut      | no     |      |
| next_task                | immut      | no     |      |
| next_hnt_task            | immut      | no     |      |
| task_rent_refund         | immut      | no     |      |
| hnt_task_rent_refund     | immut      | no     |      |
| dca_mint                 | immut      | no     |      |
| dca_mint_account         | immut      | no     |      |
| tuktuk_program           | immut      | no     |      |
| system_program           | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### AutoTopOffV0

undefined

### DaoV0

undefined

### DataCreditsV0

undefined

### DelegatedDataCreditsV0

undefined

### MintWindowedCircuitBreakerV0

undefined

### PriceUpdateV2

undefined

### SubDaoV0

undefined

### TaskQueueAuthorityV0

undefined

### TaskQueueV0

undefined

## Types

### AutoTopOffV0

| Field                  | Type            |
| ---------------------- | --------------- |
| authority              | pubkey          |
| data_credits           | pubkey          |
| task_queue             | pubkey          |
| sub_dao                | pubkey          |
| next_task              | pubkey          |
| next_hnt_task          | pubkey          |
| delegated_data_credits | pubkey          |
| dc_mint                | pubkey          |
| hnt_mint               | pubkey          |
| dao                    | pubkey          |
| hnt_price_oracle       | pubkey          |
| hnt_account            | pubkey          |
| dc_account             | pubkey          |
| escrow_account         | pubkey          |
| circuit_breaker        | pubkey          |
| bump                   | u8              |
| queue_authority_bump   | u8              |
| reserved               | [object Object] |
| threshold              | u64             |
| schedule               | [object Object] |
| dca_url                | [object Object] |
| dca_signer             | pubkey          |
| hnt_threshold          | u64             |
| dca_mint               | pubkey          |
| dca_mint_account       | pubkey          |
| dca_swap_amount        | u64             |
| dca_interval_seconds   | u64             |
| dca_input_price_oracle | pubkey          |
| dca                    | pubkey          |

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

### DaoV0

| Field                     | Type            |
| ------------------------- | --------------- |
| hnt_mint                  | pubkey          |
| dc_mint                   | pubkey          |
| authority                 | pubkey          |
| registrar                 | pubkey          |
| hst_pool                  | pubkey          |
| net_emissions_cap         | u64             |
| num_sub_daos              | u32             |
| emission_schedule         | [object Object] |
| hst_emission_schedule     | [object Object] |
| bump_seed                 | u8              |
| rewards_escrow            | pubkey          |
| delegator_pool            | pubkey          |
| delegator_rewards_percent | u64             |
| proposal_namespace        | pubkey          |
| recent_proposals          | [object Object] |

### DataCreditsV0

| Field              | Type   |
| ------------------ | ------ |
| dc_mint            | pubkey |
| hnt_mint           | pubkey |
| authority          | pubkey |
| hnt_price_oracle   | pubkey |
| data_credits_bump  | u8     |
| account_payer      | pubkey |
| account_payer_bump | u8     |

### DelegatedDataCreditsV0

| Field          | Type   |
| -------------- | ------ |
| data_credits   | pubkey |
| sub_dao        | pubkey |
| escrow_account | pubkey |
| router_key     | string |
| bump           | u8     |

### EmissionScheduleItem

| Field               | Type |
| ------------------- | ---- |
| start_unix_time     | i64  |
| emissions_per_epoch | u64  |

### InitializeAutoTopOffArgsV0

| Field                  | Type   |
| ---------------------- | ------ |
| schedule               | string |
| threshold              | u64    |
| router_key             | string |
| hnt_threshold          | u64    |
| dca_mint               | pubkey |
| dca_swap_amount        | u64    |
| dca_interval_seconds   | u64    |
| dca_input_price_oracle | pubkey |
| dca_url                | string |
| dca_signer             | pubkey |

### MintWindowedCircuitBreakerV0

| Field          | Type            |
| -------------- | --------------- |
| mint           | pubkey          |
| authority      | pubkey          |
| mint_authority | pubkey          |
| config         | [object Object] |
| last_window    | [object Object] |
| bump_seed      | u8              |

### PercentItem

| Field           | Type |
| --------------- | ---- |
| start_unix_time | i64  |
| percent         | u8   |

### PriceFeedMessage

| Field             | Type            |
| ----------------- | --------------- |
| feed_id           | [object Object] |
| price             | i64             |
| conf              | u64             |
| exponent          | i32             |
| publish_time      | i64             |
| prev_publish_time | i64             |
| ema_price         | i64             |
| ema_conf          | u64             |

### PriceUpdateV2

| Field              | Type            |
| ------------------ | --------------- |
| write_authority    | pubkey          |
| verification_level | [object Object] |
| price_message      | [object Object] |
| posted_slot        | u64             |

### RecentProposal

| Field    | Type   |
| -------- | ------ |
| proposal | pubkey |
| ts       | i64    |

### RunTaskReturnV0

| Field    | Type            |
| -------- | --------------- |
| tasks    | [object Object] |
| accounts | pubkey          |

### ScheduleTaskArgsV0

| Field       | Type |
| ----------- | ---- |
| task_id     | u16  |
| hnt_task_id | u16  |

### SubDaoV0

| Field                                  | Type            |
| -------------------------------------- | --------------- |
| dao                                    | pubkey          |
| dnt_mint                               | pubkey          |
| treasury                               | pubkey          |
| rewards_escrow                         | pubkey          |
| delegator_pool                         | pubkey          |
| vehnt_delegated                        | u128            |
| vehnt_last_calculated_ts               | i64             |
| vehnt_fall_rate                        | u128            |
| authority                              | pubkey          |
| \_deprecated_active_device_aggregator  | pubkey          |
| dc_burn_authority                      | pubkey          |
| onboarding_dc_fee                      | u64             |
| emission_schedule                      | [object Object] |
| bump_seed                              | u8              |
| registrar                              | pubkey          |
| \_deprecated_delegator_rewards_percent | u64             |
| onboarding_data_only_dc_fee            | u64             |
| dc_onboarding_fees_paid                | u64             |
| active_device_authority                | pubkey          |

### TaskQueueAuthorityV0

| Field           | Type   |
| --------------- | ------ |
| task_queue      | pubkey |
| queue_authority | pubkey |
| bump_seed       | u8     |

### TaskQueueV0

| Field                     | Type   |
| ------------------------- | ------ |
| tuktuk_config             | pubkey |
| id                        | u32    |
| update_authority          | pubkey |
| reserved                  | pubkey |
| min_crank_reward          | u64    |
| uncollected_protocol_fees | u64    |
| capacity                  | u16    |
| created_at                | i64    |
| updated_at                | i64    |
| bump_seed                 | u8     |
| task_bitmap               | bytes  |
| name                      | string |
| lookup_tables             | pubkey |
| num_queue_authorities     | u16    |
| stale_task_age            | u32    |

### TaskReturnV0

| Field        | Type            |
| ------------ | --------------- |
| trigger      | [object Object] |
| transaction  | [object Object] |
| crank_reward | u64             |
| free_tasks   | u8              |
| description  | string          |

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### TransactionSourceV0

| Variant    | Fields                      |
| ---------- | --------------------------- |
| CompiledV0 | undefined: undefined        |
| RemoteV0   | url: string, signer: pubkey |

### TriggerV0

| Variant   | Fields               |
| --------- | -------------------- |
| Now       |                      |
| Timestamp | undefined: undefined |

### UpdateAutoTopOffArgsV0

| Field                  | Type   |
| ---------------------- | ------ |
| schedule               | string |
| threshold              | u64    |
| hnt_price_oracle       | pubkey |
| hnt_threshold          | u64    |
| dca_swap_amount        | u64    |
| dca_interval_seconds   | u64    |
| dca_input_price_oracle | pubkey |

### VerificationLevel

| Variant | Fields             |
| ------- | ------------------ |
| Partial | num_signatures: u8 |
| Full    |                    |

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
