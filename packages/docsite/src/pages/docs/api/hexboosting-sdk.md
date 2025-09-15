# Hexboosting SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### boost_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| boost_config             | immut      | no     |      |
| carrier                  | immut      | no     |      |
| hexboost_authority       | immut      | no     |      |
| data_credits             | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| payment_account          | immut      | no     |      |
| boosted_hex              | immut      | no     |      |
| system_program           | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| data_credits_program     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### close_boost_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| rent_reclaim_authority | immut      | no     |      |
| boost_config           | immut      | no     |      |
| boosted_hex            | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### close_boost_v1

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| rent_reclaim_authority | immut      | no     |      |
| boost_config           | immut      | no     |      |
| boosted_hex            | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_boost_config_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | immut      | no     |      |
| sub_dao                | immut      | no     |      |
| authority              | immut      | no     |      |
| rent_reclaim_authority | immut      | no     |      |
| start_authority        | immut      | no     |      |
| price_oracle           | immut      | no     |      |
| dc_mint                | immut      | no     |      |
| boost_config           | immut      | no     |      |
| system_program         | immut      | no     |      |
| dao                    | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### start_boost_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| start_authority | immut      | no     |      |
| boost_config    | immut      | no     |      |
| boosted_hex     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### start_boost_v1

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| start_authority | immut      | no     |      |
| boost_config    | immut      | no     |      |
| boosted_hex     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_boost_config_v0

#### Accounts

| Name         | Mutability | Signer | Docs |
| ------------ | ---------- | ------ | ---- |
| sub_dao      | immut      | no     |      |
| authority    | immut      | no     |      |
| boost_config | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### BoostConfigV0

undefined

### BoostedHexV0

undefined

### BoostedHexV1

undefined

### CarrierV0

undefined

### DaoV0

undefined

### DataCreditsV0

undefined

### SubDaoV0

undefined

## Types

### BoostAmountV0

| Field  | Type |
| ------ | ---- |
| period | u16  |
| amount | u8   |

### BoostArgsV0

| Field       | Type            |
| ----------- | --------------- |
| location    | u64             |
| version     | u32             |
| amounts     | [object Object] |
| device_type | [object Object] |

### BoostConfigV0

| Field                  | Type   |
| ---------------------- | ------ |
| price_oracle           | pubkey |
| payment_mint           | pubkey |
| sub_dao                | pubkey |
| rent_reclaim_authority | pubkey |
| boost_price            | u64    |
| period_length          | u32    |
| minimum_periods        | u16    |
| bump_seed              | u8     |
| start_authority        | pubkey |
| dc_mint                | pubkey |

### BoostedHexV0

| Field            | Type            |
| ---------------- | --------------- |
| boost_config     | pubkey          |
| location         | u64             |
| start_ts         | i64             |
| reserved         | [object Object] |
| bump_seed        | u8              |
| boosts_by_period | bytes           |
| version          | u32             |

### BoostedHexV1

| Field            | Type            |
| ---------------- | --------------- |
| device_type      | [object Object] |
| boost_config     | pubkey          |
| version          | u32             |
| location         | u64             |
| start_ts         | i64             |
| bump_seed        | u8              |
| boosts_by_period | bytes           |

### CarrierV0

| Field                     | Type   |
| ------------------------- | ------ |
| sub_dao                   | pubkey |
| update_authority          | pubkey |
| issuing_authority         | pubkey |
| collection                | pubkey |
| escrow                    | pubkey |
| name                      | string |
| merkle_tree               | pubkey |
| approved                  | bool   |
| collection_bump_seed      | u8     |
| bump_seed                 | u8     |
| hexboost_authority        | pubkey |
| incentive_escrow_fund_bps | u16    |

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

### DeviceTypeV0

| Variant     | Fields |
| ----------- | ------ |
| CbrsIndoor  |        |
| CbrsOutdoor |        |
| WifiIndoor  |        |
| WifiOutdoor |        |

### EmissionScheduleItem

| Field               | Type |
| ------------------- | ---- |
| start_unix_time     | i64  |
| emissions_per_epoch | u64  |

### InitializeBoostConfigArgsV0

| Field           | Type |
| --------------- | ---- |
| boost_price     | u64  |
| period_length   | u32  |
| minimum_periods | u16  |

### PercentItem

| Field           | Type |
| --------------- | ---- |
| start_unix_time | i64  |
| percent         | u8   |

### RecentProposal

| Field    | Type   |
| -------- | ------ |
| proposal | pubkey |
| ts       | i64    |

### StartBoostArgsV0

| Field    | Type |
| -------- | ---- |
| start_ts | i64  |

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

### UpdateBoostConfigArgsV0

| Field                  | Type   |
| ---------------------- | ------ |
| start_authority        | pubkey |
| rent_reclaim_authority | pubkey |
| boost_price            | u64    |
| minimum_periods        | u16    |
| price_oracle           | pubkey |
| dc_mint                | pubkey |
