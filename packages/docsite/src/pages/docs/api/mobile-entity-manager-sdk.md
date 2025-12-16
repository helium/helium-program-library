# Mobile Entity Manager SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### approve_carrier_v0

#### Accounts

| Name      | Mutability | Signer | Docs |
| --------- | ---------- | ------ | ---- |
| sub_dao   | immut      | no     |      |
| authority | immut      | no     |      |
| carrier   | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_carrier_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| carrier                  | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| hnt_mint                 | immut      | no     |      |
| collection               | immut      | no     |      |
| metadata                 | immut      | no     |      |
| master_edition           | immut      | no     |      |
| token_account            | immut      | no     |      |
| source                   | immut      | no     |      |
| escrow                   | immut      | no     |      |
| token_metadata_program   | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| token_program            | immut      | no     |      |
| rent                     | immut      | no     |      |
| dao                      | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_incentive_program_v0

#### Accounts

| Name                          | Mutability | Signer | Docs |
| ----------------------------- | ---------- | ------ | ---- |
| payer                         | immut      | no     |      |
| issuing_authority             | immut      | no     |      |
| program_approval              | immut      | no     |      |
| carrier                       | immut      | no     |      |
| collection                    | immut      | no     |      |
| collection_metadata           | immut      | no     |      |
| collection_master_edition     | immut      | no     |      |
| entity_creator                | immut      | no     |      |
| dao                           | immut      | no     |      |
| sub_dao                       | immut      | no     |      |
| key_to_asset                  | immut      | no     |      |
| incentive_escrow_program      | immut      | no     |      |
| tree_authority                | immut      | no     |      |
| recipient                     | immut      | no     |      |
| merkle_tree                   | immut      | no     |      |
| bubblegum_signer              | immut      | no     |      |
| token_metadata_program        | immut      | no     |      |
| log_wrapper                   | immut      | no     |      |
| bubblegum_program             | immut      | no     |      |
| compression_program           | immut      | no     |      |
| system_program                | immut      | no     |      |
| helium_entity_manager_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_subscriber_v0

#### Accounts

| Name                          | Mutability | Signer | Docs |
| ----------------------------- | ---------- | ------ | ---- |
| payer                         | immut      | no     |      |
| program_approval              | immut      | no     |      |
| carrier                       | immut      | no     |      |
| issuing_authority             | immut      | no     |      |
| collection                    | immut      | no     |      |
| collection_metadata           | immut      | no     |      |
| collection_master_edition     | immut      | no     |      |
| entity_creator                | immut      | no     |      |
| dao                           | immut      | no     |      |
| sub_dao                       | immut      | no     |      |
| key_to_asset                  | immut      | no     |      |
| tree_authority                | immut      | no     |      |
| recipient                     | immut      | no     |      |
| merkle_tree                   | immut      | no     |      |
| bubblegum_signer              | immut      | no     |      |
| token_metadata_program        | immut      | no     |      |
| log_wrapper                   | immut      | no     |      |
| bubblegum_program             | immut      | no     |      |
| compression_program           | immut      | no     |      |
| system_program                | immut      | no     |      |
| helium_entity_manager_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### issue_carrier_nft_v0

#### Accounts

| Name                          | Mutability | Signer | Docs |
| ----------------------------- | ---------- | ------ | ---- |
| payer                         | immut      | no     |      |
| program_approval              | immut      | no     |      |
| carrier                       | immut      | no     |      |
| issuing_authority             | immut      | no     |      |
| collection                    | immut      | no     |      |
| collection_metadata           | immut      | no     |      |
| collection_master_edition     | immut      | no     |      |
| entity_creator                | immut      | no     |      |
| dao                           | immut      | no     |      |
| sub_dao                       | immut      | no     |      |
| key_to_asset                  | immut      | no     |      |
| tree_authority                | immut      | no     |      |
| recipient                     | immut      | no     |      |
| merkle_tree                   | immut      | no     |      |
| bubblegum_signer              | immut      | no     |      |
| token_metadata_program        | immut      | no     |      |
| log_wrapper                   | immut      | no     |      |
| bubblegum_program             | immut      | no     |      |
| compression_program           | immut      | no     |      |
| system_program                | immut      | no     |      |
| helium_entity_manager_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### issue_mapping_rewards_nft_v0

#### Accounts

| Name                          | Mutability | Signer | Docs |
| ----------------------------- | ---------- | ------ | ---- |
| payer                         | immut      | no     |      |
| program_approval              | immut      | no     |      |
| carrier                       | immut      | no     |      |
| issuing_authority             | immut      | no     |      |
| collection                    | immut      | no     |      |
| collection_metadata           | immut      | no     |      |
| collection_master_edition     | immut      | no     |      |
| entity_creator                | immut      | no     |      |
| dao                           | immut      | no     |      |
| sub_dao                       | immut      | no     |      |
| key_to_asset                  | immut      | no     |      |
| tree_authority                | immut      | no     |      |
| recipient                     | immut      | no     |      |
| merkle_tree                   | immut      | no     |      |
| bubblegum_signer              | immut      | no     |      |
| token_metadata_program        | immut      | no     |      |
| log_wrapper                   | immut      | no     |      |
| bubblegum_program             | immut      | no     |      |
| compression_program           | immut      | no     |      |
| system_program                | immut      | no     |      |
| helium_entity_manager_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### issue_service_rewards_nft_v0

#### Accounts

| Name                          | Mutability | Signer | Docs |
| ----------------------------- | ---------- | ------ | ---- |
| payer                         | immut      | no     |      |
| program_approval              | immut      | no     |      |
| carrier                       | immut      | no     |      |
| issuing_authority             | immut      | no     |      |
| collection                    | immut      | no     |      |
| collection_metadata           | immut      | no     |      |
| collection_master_edition     | immut      | no     |      |
| entity_creator                | immut      | no     |      |
| dao                           | immut      | no     |      |
| sub_dao                       | immut      | no     |      |
| key_to_asset                  | immut      | no     |      |
| tree_authority                | immut      | no     |      |
| recipient                     | immut      | no     |      |
| merkle_tree                   | immut      | no     |      |
| bubblegum_signer              | immut      | no     |      |
| token_metadata_program        | immut      | no     |      |
| log_wrapper                   | immut      | no     |      |
| bubblegum_program             | immut      | no     |      |
| compression_program           | immut      | no     |      |
| system_program                | immut      | no     |      |
| helium_entity_manager_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### revoke_carrier_v0

#### Accounts

| Name      | Mutability | Signer | Docs |
| --------- | ---------- | ------ | ---- |
| sub_dao   | immut      | no     |      |
| authority | immut      | no     |      |
| carrier   | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### swap_carrier_stake

#### Accounts

| Name                       | Mutability | Signer | Docs |
| -------------------------- | ---------- | ------ | ---- |
| payer                      | immut      | no     |      |
| update_authority           | immut      | no     |      |
| carrier                    | immut      | no     |      |
| sub_dao                    | immut      | no     |      |
| dao                        | immut      | no     |      |
| dnt_mint                   | immut      | no     |      |
| hnt_mint                   | immut      | no     |      |
| new_stake_source           | immut      | no     |      |
| original_stake_destination | immut      | no     |      |
| original_stake             | immut      | no     |      |
| new_escrow                 | immut      | no     |      |
| associated_token_program   | immut      | no     |      |
| system_program             | immut      | no     |      |
| token_program              | immut      | no     |      |
| rent                       | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### update_carrier_tree_v0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| payer               | immut      | no     |      |
| carrier             | immut      | no     |      |
| tree_config         | immut      | no     |      |
| new_tree_authority  | immut      | no     |      |
| new_merkle_tree     | immut      | no     |      |
| log_wrapper         | immut      | no     |      |
| system_program      | immut      | no     |      |
| bubblegum_program   | immut      | no     |      |
| compression_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_carrier_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| carrier          | immut      | no     |      |
| update_authority | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_incentive_program_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| issuing_authority        | immut      | no     |      |
| carrier                  | immut      | no     |      |
| incentive_escrow_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### CarrierV0

undefined

### DaoV0

undefined

### IncentiveEscrowProgramV0

undefined

### ProgramApprovalV0

undefined

### SubDaoV0

undefined

### TreeConfig

undefined

## Types

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

### DecompressibleState

| Variant  | Fields |
| -------- | ------ |
| Enabled  |        |
| Disabled |        |

### EmissionScheduleItem

| Field               | Type |
| ------------------- | ---- |
| start_unix_time     | i64  |
| emissions_per_epoch | u64  |

### IncentiveEscrowProgramV0

| Field     | Type   |
| --------- | ------ |
| carrier   | pubkey |
| start_ts  | i64    |
| stop_ts   | i64    |
| shares    | u32    |
| bump_seed | u8     |
| name      | string |

### InitializeCarrierArgsV0

| Field                     | Type   |
| ------------------------- | ------ |
| update_authority          | pubkey |
| issuing_authority         | pubkey |
| hexboost_authority        | pubkey |
| name                      | string |
| metadata_url              | string |
| incentive_escrow_fund_bps | u16    |

### InitializeIncentiveProgramArgsV0

| Field        | Type   |
| ------------ | ------ |
| name         | string |
| metadata_url | string |
| start_ts     | i64    |
| stop_ts      | i64    |
| shares       | u32    |

### InitializeSubscriberArgsV0

| Field        | Type   |
| ------------ | ------ |
| entity_key   | bytes  |
| name         | string |
| metadata_url | string |

### IssueCarrierNftArgsV0

| Field        | Type   |
| ------------ | ------ |
| metadata_url | string |

### IssueMappingRewardsNftArgsV0

| Field        | Type   |
| ------------ | ------ |
| metadata_url | string |

### IssueServiceRewardsNftArgsV0

| Field        | Type   |
| ------------ | ------ |
| metadata_url | string |

### PercentItem

| Field           | Type |
| --------------- | ---- |
| start_unix_time | i64  |
| percent         | u8   |

### ProgramApprovalV0

| Field      | Type   |
| ---------- | ------ |
| dao        | pubkey |
| program_id | pubkey |
| bump_seed  | u8     |

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

### TreeConfig

| Field               | Type            |
| ------------------- | --------------- |
| tree_creator        | pubkey          |
| tree_delegate       | pubkey          |
| total_mint_capacity | u64             |
| num_minted          | u64             |
| is_public           | bool            |
| is_decompressible   | [object Object] |

### UpdateCarrierArgsV0

| Field                     | Type   |
| ------------------------- | ------ |
| update_authority          | pubkey |
| issuing_authority         | pubkey |
| hexboost_authority        | pubkey |
| incentive_escrow_fund_bps | u16    |

### UpdateCarrierTreeArgsV0

| Field           | Type |
| --------------- | ---- |
| max_depth       | u32  |
| max_buffer_size | u32  |

### UpdateIncentiveProgramV0Args

| Field    | Type |
| -------- | ---- |
| start_ts | i64  |
| stop_ts  | i64  |
| shares   | u32  |
