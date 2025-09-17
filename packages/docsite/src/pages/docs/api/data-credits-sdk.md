# Data Credits SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### burn_delegated_data_credits_v0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| sub_dao_epoch_info      | immut      | no     |      |
| sub_dao                 | immut      | no     |      |
| dc_burn_authority       | immut      | no     |      |
| registrar               | immut      | no     |      |
| dao                     | immut      | no     |      |
| dc_mint                 | immut      | no     |      |
| account_payer           | immut      | no     |      |
| data_credits            | immut      | no     |      |
| delegated_data_credits  | immut      | no     |      |
| escrow_account          | immut      | no     |      |
| token_program           | immut      | no     |      |
| helium_sub_daos_program | immut      | no     |      |
| system_program          | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### burn_without_tracking_v0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| burn_accounts | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### change_delegated_sub_dao_v0

#### Accounts

| Name                               | Mutability | Signer | Docs |
| ---------------------------------- | ---------- | ------ | ---- |
| payer                              | immut      | no     |      |
| authority                          | immut      | no     |      |
| delegated_data_credits             | immut      | no     |      |
| destination_delegated_data_credits | immut      | no     |      |
| data_credits                       | immut      | no     |      |
| dc_mint                            | immut      | no     |      |
| dao                                | immut      | no     |      |
| sub_dao                            | immut      | no     |      |
| destination_sub_dao                | immut      | no     |      |
| escrow_account                     | immut      | no     |      |
| destination_escrow_account         | immut      | no     |      |
| associated_token_program           | immut      | no     |      |
| token_program                      | immut      | no     |      |
| system_program                     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### delegate_data_credits_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| delegated_data_credits   | immut      | no     |      |
| data_credits             | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| dao                      | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| owner                    | immut      | no     |      |
| from_account             | immut      | no     |      |
| escrow_account           | immut      | no     |      |
| payer                    | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| token_program            | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### genesis_issue_delegated_data_credits_v0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| delegated_data_credits  | immut      | no     |      |
| data_credits            | immut      | no     |      |
| lazy_signer             | immut      | no     |      |
| dc_mint                 | immut      | no     |      |
| circuit_breaker         | immut      | no     |      |
| circuit_breaker_program | immut      | no     |      |
| dao                     | immut      | no     |      |
| sub_dao                 | immut      | no     |      |
| escrow_account          | immut      | no     |      |
| token_program           | immut      | no     |      |
| system_program          | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_data_credits_v0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| data_credits            | immut      | no     |      |
| hnt_mint                | immut      | no     |      |
| circuit_breaker         | immut      | no     |      |
| dc_mint                 | immut      | no     |      |
| mint_authority          | immut      | no     |      |
| freeze_authority        | immut      | no     |      |
| account_payer           | immut      | no     |      |
| payer                   | immut      | no     |      |
| circuit_breaker_program | immut      | no     |      |
| token_program           | immut      | no     |      |
| system_program          | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### issue_data_credits_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| data_credits             | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| to                       | immut      | no     |      |
| from                     | immut      | no     |      |
| from_account             | immut      | no     |      |
| to_account               | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### mint_data_credits_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| data_credits             | immut      | no     |      |
| hnt_price_oracle         | immut      | no     |      |
| burner                   | immut      | no     |      |
| recipient_token_account  | immut      | no     |      |
| recipient                | immut      | no     |      |
| owner                    | immut      | no     |      |
| hnt_mint                 | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| circuit_breaker          | immut      | no     |      |
| circuit_breaker_program  | immut      | no     |      |
| token_program            | immut      | no     |      |
| system_program           | immut      | no     |      |
| associated_token_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_data_credits_v0

#### Accounts

| Name         | Mutability | Signer | Docs |
| ------------ | ---------- | ------ | ---- |
| data_credits | immut      | no     |      |
| dc_mint      | immut      | no     |      |
| authority    | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

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

## Types

### BurnDelegatedDataCreditsArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### BurnWithoutTrackingArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### ChangeDelegatedSubDaoArgsV0

| Field      | Type   |
| ---------- | ------ |
| amount     | u64    |
| router_key | string |

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

### DelegateDataCreditsArgsV0

| Field      | Type   |
| ---------- | ------ |
| amount     | u64    |
| router_key | string |

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

### GenesisIssueDelegatedDataCreditsArgsV0

| Field      | Type   |
| ---------- | ------ |
| amount     | u64    |
| router_key | string |

### InitializeDataCreditsArgsV0

| Field     | Type            |
| --------- | --------------- |
| authority | pubkey          |
| config    | [object Object] |

### IssueDataCreditsArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### MintDataCreditsArgsV0

| Field      | Type |
| ---------- | ---- |
| hnt_amount | u64  |
| dc_amount  | u64  |

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

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### UpdateDataCreditsArgsV0

| Field         | Type   |
| ------------- | ------ |
| new_authority | pubkey |

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
