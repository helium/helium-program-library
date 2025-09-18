# Helium Entity Manager SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### approve_maker_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| hnt_mint                 | immut      | no     |      |
| escrow                   | immut      | no     |      |
| authority                | immut      | no     |      |
| maker                    | immut      | no     |      |
| maker_approval           | immut      | no     |      |
| system_program           | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| dao                      | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### approve_program_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| payer            | immut      | no     |      |
| dao              | immut      | no     |      |
| authority        | immut      | no     |      |
| program_approval | immut      | no     |      |
| system_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_data_only_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| authority                | immut      | no     |      |
| data_only_config         | immut      | no     |      |
| dao                      | immut      | no     |      |
| tree_authority           | immut      | no     |      |
| merkle_tree              | immut      | no     |      |
| collection               | immut      | no     |      |
| token_account            | immut      | no     |      |
| master_edition           | immut      | no     |      |
| metadata                 | immut      | no     |      |
| token_metadata_program   | immut      | no     |      |
| log_wrapper              | immut      | no     |      |
| system_program           | immut      | no     |      |
| bubblegum_program        | immut      | no     |      |
| compression_program      | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_maker_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| maker                    | immut      | no     |      |
| dao                      | immut      | no     |      |
| collection               | immut      | no     |      |
| metadata                 | immut      | no     |      |
| master_edition           | immut      | no     |      |
| token_account            | immut      | no     |      |
| token_metadata_program   | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| token_program            | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_rewardable_entity_config_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| authority                | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### issue_data_only_entity_v0

#### Accounts

| Name                      | Mutability | Signer | Docs |
| ------------------------- | ---------- | ------ | ---- |
| payer                     | immut      | no     |      |
| ecc_verifier              | immut      | no     |      |
| collection                | immut      | no     |      |
| collection_metadata       | immut      | no     |      |
| collection_master_edition | immut      | no     |      |
| data_only_config          | immut      | no     |      |
| entity_creator            | immut      | no     |      |
| dao                       | immut      | no     |      |
| key_to_asset              | immut      | no     |      |
| tree_authority            | immut      | no     |      |
| recipient                 | immut      | no     |      |
| merkle_tree               | immut      | no     |      |
| data_only_escrow          | immut      | no     |      |
| bubblegum_signer          | immut      | no     |      |
| token_metadata_program    | immut      | no     |      |
| log_wrapper               | immut      | no     |      |
| bubblegum_program         | immut      | no     |      |
| compression_program       | immut      | no     |      |
| system_program            | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### issue_entity_v0

#### Accounts

| Name                      | Mutability | Signer | Docs |
| ------------------------- | ---------- | ------ | ---- |
| payer                     | immut      | no     |      |
| ecc_verifier              | immut      | no     |      |
| issuing_authority         | immut      | no     |      |
| collection                | immut      | no     |      |
| collection_metadata       | immut      | no     |      |
| collection_master_edition | immut      | no     |      |
| maker                     | immut      | no     |      |
| entity_creator            | immut      | no     |      |
| dao                       | immut      | no     |      |
| key_to_asset              | immut      | no     |      |
| tree_authority            | immut      | no     |      |
| recipient                 | immut      | no     |      |
| merkle_tree               | immut      | no     |      |
| bubblegum_signer          | immut      | no     |      |
| token_metadata_program    | immut      | no     |      |
| log_wrapper               | immut      | no     |      |
| bubblegum_program         | immut      | no     |      |
| compression_program       | immut      | no     |      |
| system_program            | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### issue_iot_operations_fund_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| authority                | immut      | no     |      |
| dao                      | immut      | no     |      |
| entity_creator           | immut      | no     |      |
| key_to_asset             | immut      | no     |      |
| recipient                | immut      | no     |      |
| recipient_account        | immut      | no     |      |
| mint                     | immut      | no     |      |
| metadata                 | immut      | no     |      |
| master_edition           | immut      | no     |      |
| token_metadata_program   | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### issue_not_emitted_entity_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| authority                | immut      | no     |      |
| dao                      | immut      | no     |      |
| entity_creator           | immut      | no     |      |
| key_to_asset             | immut      | no     |      |
| recipient                | immut      | no     |      |
| recipient_account        | immut      | no     |      |
| mint                     | immut      | no     |      |
| metadata                 | immut      | no     |      |
| master_edition           | immut      | no     |      |
| token_metadata_program   | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| instructions             | immut      | no     |      |
| no_emit_program          | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### issue_program_entity_v0

#### Accounts

| Name                      | Mutability | Signer | Docs |
| ------------------------- | ---------- | ------ | ---- |
| payer                     | immut      | no     |      |
| program_approver          | immut      | no     |      |
| program_approval          | immut      | no     |      |
| collection_authority      | immut      | no     |      |
| collection                | immut      | no     |      |
| collection_metadata       | immut      | no     |      |
| collection_master_edition | immut      | no     |      |
| entity_creator            | immut      | no     |      |
| dao                       | immut      | no     |      |
| key_to_asset              | immut      | no     |      |
| tree_authority            | immut      | no     |      |
| recipient                 | immut      | no     |      |
| merkle_tree               | immut      | no     |      |
| bubblegum_signer          | immut      | no     |      |
| token_metadata_program    | immut      | no     |      |
| log_wrapper               | immut      | no     |      |
| bubblegum_program         | immut      | no     |      |
| compression_program       | immut      | no     |      |
| system_program            | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### onboard_data_only_iot_hotspot_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| dc_fee_payer             | immut      | no     |      |
| iot_info                 | immut      | no     |      |
| hotspot_owner            | immut      | no     |      |
| merkle_tree              | immut      | no     |      |
| dc_burner                | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| data_only_config         | immut      | no     |      |
| dao                      | immut      | no     |      |
| key_to_asset             | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| dc                       | immut      | no     |      |
| compression_program      | immut      | no     |      |
| data_credits_program     | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| helium_sub_daos_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### onboard_data_only_mobile_hotspot_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| dc_fee_payer             | immut      | no     |      |
| mobile_info              | immut      | no     |      |
| hotspot_owner            | immut      | no     |      |
| merkle_tree              | immut      | no     |      |
| dc_burner                | immut      | no     |      |
| dnt_burner               | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| data_only_config         | immut      | no     |      |
| dao                      | immut      | no     |      |
| key_to_asset             | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| dnt_mint                 | immut      | no     |      |
| dnt_price                | immut      | no     |      |
| dc                       | immut      | no     |      |
| compression_program      | immut      | no     |      |
| data_credits_program     | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| helium_sub_daos_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### onboard_iot_hotspot_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| dc_fee_payer             | immut      | no     |      |
| issuing_authority        | immut      | no     |      |
| iot_info                 | immut      | no     |      |
| hotspot_owner            | immut      | no     |      |
| merkle_tree              | immut      | no     |      |
| dc_burner                | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| maker_approval           | immut      | no     |      |
| maker                    | immut      | no     |      |
| dao                      | immut      | no     |      |
| key_to_asset             | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| dc                       | immut      | no     |      |
| compression_program      | immut      | no     |      |
| data_credits_program     | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| helium_sub_daos_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### onboard_mobile_hotspot_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| dc_fee_payer             | immut      | no     |      |
| issuing_authority        | immut      | no     |      |
| mobile_info              | immut      | no     |      |
| hotspot_owner            | immut      | no     |      |
| merkle_tree              | immut      | no     |      |
| dc_burner                | immut      | no     |      |
| dnt_burner               | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| maker_approval           | immut      | no     |      |
| maker                    | immut      | no     |      |
| dao                      | immut      | no     |      |
| key_to_asset             | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| dnt_mint                 | immut      | no     |      |
| dnt_price                | immut      | no     |      |
| dc                       | immut      | no     |      |
| compression_program      | immut      | no     |      |
| data_credits_program     | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| helium_sub_daos_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### revoke_maker_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| refund                   | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| authority                | immut      | no     |      |
| maker                    | immut      | no     |      |
| maker_approval           | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### revoke_program_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| refund           | immut      | no     |      |
| dao              | immut      | no     |      |
| authority        | immut      | no     |      |
| program_approval | immut      | no     |      |
| system_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### set_entity_active_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| active_device_authority  | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| info                     | immut      | no     |      |
| helium_sub_daos_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### set_maker_tree_v0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| payer               | immut      | no     |      |
| update_authority    | immut      | no     |      |
| maker               | immut      | no     |      |
| tree_authority      | immut      | no     |      |
| merkle_tree         | immut      | no     |      |
| log_wrapper         | immut      | no     |      |
| system_program      | immut      | no     |      |
| bubblegum_program   | immut      | no     |      |
| compression_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### swap_maker_stake

#### Accounts

| Name                       | Mutability | Signer | Docs |
| -------------------------- | ---------- | ------ | ---- |
| payer                      | immut      | no     |      |
| update_authority           | immut      | no     |      |
| maker                      | immut      | no     |      |
| maker_approval             | immut      | no     |      |
| rewardable_entity_config   | immut      | no     |      |
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

### temp_backfill_mobile_info

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| payer          | immut      | no     |      |
| mobile_info    | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### temp_pay_mobile_onboarding_fee_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| dc_fee_payer             | immut      | no     |      |
| dc_burner                | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| dao                      | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| dc                       | immut      | no     |      |
| key_to_asset             | immut      | no     |      |
| mobile_info              | immut      | no     |      |
| data_credits_program     | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| helium_sub_daos_program  | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### temp_standardize_entity

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| key_to_asset           | immut      | no     |      |
| merkle_tree            | immut      | no     |      |
| maker                  | immut      | no     |      |
| data_only_config       | immut      | no     |      |
| tree_authority         | immut      | no     |      |
| authority              | immut      | no     |      |
| collection             | immut      | no     |      |
| collection_metadata    | immut      | no     |      |
| leaf_owner             | immut      | no     |      |
| payer                  | immut      | no     |      |
| log_wrapper            | immut      | no     |      |
| compression_program    | immut      | no     |      |
| bubblegum_program      | immut      | no     |      |
| token_metadata_program | immut      | no     |      |
| system_program         | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_data_only_tree_v0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| payer               | immut      | no     |      |
| data_only_config    | immut      | no     |      |
| old_tree_authority  | immut      | no     |      |
| new_tree_authority  | immut      | no     |      |
| data_only_escrow    | immut      | no     |      |
| new_merkle_tree     | immut      | no     |      |
| log_wrapper         | immut      | no     |      |
| system_program      | immut      | no     |      |
| bubblegum_program   | immut      | no     |      |
| compression_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### update_iot_info_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| dc_fee_payer             | immut      | no     |      |
| iot_info                 | immut      | no     |      |
| hotspot_owner            | immut      | no     |      |
| merkle_tree              | immut      | no     |      |
| tree_authority           | immut      | no     |      |
| dc_burner                | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| dao                      | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| dc                       | immut      | no     |      |
| bubblegum_program        | immut      | no     |      |
| compression_program      | immut      | no     |      |
| data_credits_program     | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_maker_tree_v0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| payer               | immut      | no     |      |
| maker               | immut      | no     |      |
| tree_authority      | immut      | no     |      |
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

### update_maker_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| maker            | immut      | no     |      |
| update_authority | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_mobile_info_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| dc_fee_payer             | immut      | no     |      |
| mobile_info              | immut      | no     |      |
| hotspot_owner            | immut      | no     |      |
| merkle_tree              | immut      | no     |      |
| tree_authority           | immut      | no     |      |
| dc_burner                | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| dao                      | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| dc                       | immut      | no     |      |
| bubblegum_program        | immut      | no     |      |
| compression_program      | immut      | no     |      |
| data_credits_program     | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_rewardable_entity_config_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| authority                | immut      | no     |      |
| rewardable_entity_config | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### DaoV0

undefined

### DataCreditsV0

undefined

### DataOnlyConfigV0

undefined

### IotHotspotInfoV0

undefined

### KeyToAssetV0

undefined

### MakerApprovalV0

undefined

### MakerV0

undefined

### MobileHotspotInfoV0

undefined

### ProgramApprovalV0

undefined

### RewardableEntityConfigV0

undefined

### SubDaoV0

undefined

### TreeConfig

undefined

## Types

### ApproveProgramArgsV0

| Field      | Type   |
| ---------- | ------ |
| program_id | pubkey |

### ConfigSettingsV0

| Variant        | Fields                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------ |
| IotConfig      | min_gain: i32, max_gain: i32, full_location_staking_fee: u64, dataonly_location_staking_fee: u64 |
| MobileConfig   | full_location_staking_fee: u64, dataonly_location_staking_fee: u64                               |
| MobileConfigV1 | fees_by_device: [object Object]                                                                  |
| MobileConfigV2 | fees_by_device: [object Object]                                                                  |

### Creator

| Field    | Type   |
| -------- | ------ |
| address  | pubkey |
| verified | bool   |
| share    | u8     |

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

### DataOnlyConfigV0

| Field                 | Type   |
| --------------------- | ------ |
| authority             | pubkey |
| bump_seed             | u8     |
| collection            | pubkey |
| merkle_tree           | pubkey |
| collection_bump_seed  | u8     |
| dao                   | pubkey |
| new_tree_depth        | u32    |
| new_tree_buffer_size  | u32    |
| new_tree_space        | u64    |
| new_tree_fee_lamports | u64    |

### DecompressibleState

| Variant  | Fields |
| -------- | ------ |
| Enabled  |        |
| Disabled |        |

### DeviceFeesV0

| Field                | Type            |
| -------------------- | --------------- |
| device_type          | [object Object] |
| dc_onboarding_fee    | u64             |
| location_staking_fee | u64             |

### DeviceFeesV1

| Field                     | Type            |
| ------------------------- | --------------- |
| device_type               | [object Object] |
| dc_onboarding_fee         | u64             |
| location_staking_fee      | u64             |
| mobile_onboarding_fee_usd | u64             |
| reserved                  | [object Object] |

### EmissionScheduleItem

| Field               | Type |
| ------------------- | ---- |
| start_unix_time     | i64  |
| emissions_per_epoch | u64  |

### InitializeDataOnlyArgsV0

| Field                 | Type   |
| --------------------- | ------ |
| authority             | pubkey |
| new_tree_depth        | u32    |
| new_tree_buffer_size  | u32    |
| new_tree_space        | u64    |
| new_tree_fee_lamports | u64    |
| name                  | string |
| metadata_url          | string |

### InitializeMakerArgsV0

| Field             | Type   |
| ----------------- | ------ |
| update_authority  | pubkey |
| issuing_authority | pubkey |
| name              | string |
| metadata_url      | string |

### InitializeRewardableEntityConfigArgsV0

| Field               | Type            |
| ------------------- | --------------- |
| symbol              | string          |
| settings            | [object Object] |
| staking_requirement | u64             |

### IotHotspotInfoV0

| Field                  | Type   |
| ---------------------- | ------ |
| asset                  | pubkey |
| bump_seed              | u8     |
| location               | u64    |
| elevation              | i32    |
| gain                   | i32    |
| is_full_hotspot        | bool   |
| num_location_asserts   | u16    |
| is_active              | bool   |
| dc_onboarding_fee_paid | u64    |

### IssueDataOnlyEntityArgsV0

| Field      | Type  |
| ---------- | ----- |
| entity_key | bytes |

### IssueEntityArgsV0

| Field      | Type  |
| ---------- | ----- |
| entity_key | bytes |

### IssueProgramEntityArgsV0

| Field             | Type            |
| ----------------- | --------------- |
| entity_key        | bytes           |
| key_serialization | [object Object] |
| name              | string          |
| symbol            | string          |
| approver_seeds    | bytes           |
| metadata_url      | string          |

### KeySerialization

| Variant | Fields |
| ------- | ------ |
| B58     |        |
| UTF8    |        |

### KeyToAssetV0

| Field             | Type            |
| ----------------- | --------------- |
| dao               | pubkey          |
| asset             | pubkey          |
| entity_key        | bytes           |
| bump_seed         | u8              |
| key_serialization | [object Object] |

### MakerApprovalV0

| Field                    | Type   |
| ------------------------ | ------ |
| rewardable_entity_config | pubkey |
| maker                    | pubkey |
| bump_seed                | u8     |

### MakerV0

| Field                | Type   |
| -------------------- | ------ |
| update_authority     | pubkey |
| issuing_authority    | pubkey |
| name                 | string |
| bump_seed            | u8     |
| collection           | pubkey |
| merkle_tree          | pubkey |
| collection_bump_seed | u8     |
| dao                  | pubkey |

### MetadataArgs

| Field    | Type            |
| -------- | --------------- |
| name     | string          |
| symbol   | string          |
| uri      | string          |
| creators | [object Object] |

### MobileDeploymentInfoV0

| Variant    | Fields                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| WifiInfoV0 | antenna: u32, elevation: i32, azimuth: u16, mechanical_down_tilt: u16, electrical_down_tilt: u16, serial: [object Object] |
| CbrsInfoV0 | radio_infos: [object Object]                                                                                              |

### MobileDeviceTypeV0

| Variant      | Fields |
| ------------ | ------ |
| Cbrs         |        |
| WifiIndoor   |        |
| WifiOutdoor  |        |
| WifiDataOnly |        |

### MobileHotspotInfoV0

| Field                  | Type            |
| ---------------------- | --------------- |
| asset                  | pubkey          |
| bump_seed              | u8              |
| location               | u64             |
| is_full_hotspot        | bool            |
| num_location_asserts   | u16             |
| is_active              | bool            |
| dc_onboarding_fee_paid | u64             |
| device_type            | [object Object] |
| deployment_info        | [object Object] |

### OnboardDataOnlyIotHotspotArgsV0

| Field        | Type            |
| ------------ | --------------- |
| data_hash    | [object Object] |
| creator_hash | [object Object] |
| root         | [object Object] |
| index        | u32             |
| location     | u64             |
| elevation    | i32             |
| gain         | i32             |

### OnboardDataOnlyMobileHotspotArgsV0

| Field        | Type            |
| ------------ | --------------- |
| data_hash    | [object Object] |
| creator_hash | [object Object] |
| root         | [object Object] |
| index        | u32             |
| location     | u64             |

### OnboardIotHotspotArgsV0

| Field        | Type            |
| ------------ | --------------- |
| data_hash    | [object Object] |
| creator_hash | [object Object] |
| root         | [object Object] |
| index        | u32             |
| location     | u64             |
| elevation    | i32             |
| gain         | i32             |

### OnboardMobileHotspotArgsV0

| Field           | Type            |
| --------------- | --------------- |
| data_hash       | [object Object] |
| creator_hash    | [object Object] |
| root            | [object Object] |
| index           | u32             |
| location        | u64             |
| device_type     | [object Object] |
| deployment_info | [object Object] |

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

### RadioInfoV0

| Field     | Type   |
| --------- | ------ |
| radio_id  | string |
| elevation | i32    |

### RecentProposal

| Field    | Type   |
| -------- | ------ |
| proposal | pubkey |
| ts       | i64    |

### RevokeProgramArgsV0

| Field      | Type   |
| ---------- | ------ |
| program_id | pubkey |

### RewardableEntityConfigV0

| Field               | Type            |
| ------------------- | --------------- |
| authority           | pubkey          |
| symbol              | string          |
| sub_dao             | pubkey          |
| settings            | [object Object] |
| bump_seed           | u8              |
| staking_requirement | u64             |

### SetEntityActiveArgsV0

| Field      | Type  |
| ---------- | ----- |
| is_active  | bool  |
| entity_key | bytes |

### SetMakerTreeArgsV0

| Field           | Type |
| --------------- | ---- |
| max_depth       | u32  |
| max_buffer_size | u32  |

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

### TempBackfillMobileInfoArgs

| Field           | Type            |
| --------------- | --------------- |
| location        | u64             |
| deployment_info | [object Object] |

### TempStandardizeEntityArgs

| Field            | Type            |
| ---------------- | --------------- |
| root             | [object Object] |
| index            | u32             |
| current_metadata | [object Object] |

### TreeConfig

| Field               | Type            |
| ------------------- | --------------- |
| tree_creator        | pubkey          |
| tree_delegate       | pubkey          |
| total_mint_capacity | u64             |
| num_minted          | u64             |
| is_public           | bool            |
| is_decompressible   | [object Object] |

### UpdateIotInfoArgsV0

| Field        | Type            |
| ------------ | --------------- |
| location     | u64             |
| elevation    | i32             |
| gain         | i32             |
| data_hash    | [object Object] |
| creator_hash | [object Object] |
| root         | [object Object] |
| index        | u32             |

### UpdateMakerArgsV0

| Field             | Type   |
| ----------------- | ------ |
| issuing_authority | pubkey |
| update_authority  | pubkey |

### UpdateMakerTreeArgsV0

| Field           | Type |
| --------------- | ---- |
| max_depth       | u32  |
| max_buffer_size | u32  |

### UpdateMobileInfoArgsV0

| Field           | Type            |
| --------------- | --------------- |
| location        | u64             |
| data_hash       | [object Object] |
| creator_hash    | [object Object] |
| root            | [object Object] |
| index           | u32             |
| deployment_info | [object Object] |

### UpdateRewardableEntityConfigArgsV0

| Field               | Type            |
| ------------------- | --------------- |
| new_authority       | pubkey          |
| settings            | [object Object] |
| staking_requirement | u64             |
