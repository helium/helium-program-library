# Iot Routing Manager SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### approve_organization_v0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| authority      | immut      | no     |      |
| net_id         | immut      | no     |      |
| organization   | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_devaddr_constraint_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| authority                | immut      | no     |      |
| net_id                   | immut      | no     |      |
| routing_manager          | immut      | no     |      |
| organization             | immut      | no     |      |
| data_credits             | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| payer_dc_account         | immut      | no     |      |
| devaddr_constraint       | immut      | no     |      |
| token_program            | immut      | no     |      |
| system_program           | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| data_credits_program     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_net_id_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| payer            | immut      | no     |      |
| net_id_authority | immut      | no     |      |
| authority        | immut      | no     |      |
| routing_manager  | immut      | no     |      |
| net_id           | immut      | no     |      |
| system_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_organization_delegate_v0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| payer                 | immut      | no     |      |
| authority             | immut      | no     |      |
| organization          | immut      | no     |      |
| organization_delegate | immut      | no     |      |
| delegate              | immut      | no     |      |
| system_program        | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_organization_v0

#### Accounts

| Name                          | Mutability | Signer | Docs |
| ----------------------------- | ---------- | ------ | ---- |
| payer                         | immut      | no     |      |
| program_approval              | immut      | no     |      |
| routing_manager               | immut      | no     |      |
| net_id                        | immut      | no     |      |
| data_credits                  | immut      | no     |      |
| dc_mint                       | immut      | no     |      |
| payer_dc_account              | immut      | no     |      |
| authority                     | immut      | no     |      |
| organization                  | immut      | no     |      |
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
| shared_merkle                 | immut      | no     |      |
| token_metadata_program        | immut      | no     |      |
| log_wrapper                   | immut      | no     |      |
| bubblegum_program             | immut      | no     |      |
| compression_program           | immut      | no     |      |
| system_program                | immut      | no     |      |
| helium_entity_manager_program | immut      | no     |      |
| token_program                 | immut      | no     |      |
| associated_token_program      | immut      | no     |      |
| data_credits_program          | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_routing_manager_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| authority                | immut      | no     |      |
| update_authority         | immut      | no     |      |
| net_id_authority         | immut      | no     |      |
| routing_manager          | immut      | no     |      |
| dao                      | immut      | no     |      |
| sub_dao                  | immut      | no     |      |
| dc_mint                  | immut      | no     |      |
| collection               | immut      | no     |      |
| metadata                 | immut      | no     |      |
| master_edition           | immut      | no     |      |
| token_account            | immut      | no     |      |
| token_metadata_program   | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| token_program            | immut      | no     |      |
| rent                     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### remove_devaddr_constraint_v0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| rent_refund        | immut      | no     |      |
| authority          | immut      | no     |      |
| net_id             | immut      | no     |      |
| devaddr_constraint | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### remove_organization_delegate_v0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| rent_refund           | immut      | no     |      |
| authority             | immut      | no     |      |
| organization          | immut      | no     |      |
| organization_delegate | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### temp_backfill_devaddr_constraint

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| payer              | immut      | no     |      |
| net_id             | immut      | no     |      |
| routing_manager    | immut      | no     |      |
| organization       | immut      | no     |      |
| dc_mint            | immut      | no     |      |
| devaddr_constraint | immut      | no     |      |
| token_program      | immut      | no     |      |
| system_program     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### temp_backfill_organization

#### Accounts

| Name                          | Mutability | Signer | Docs |
| ----------------------------- | ---------- | ------ | ---- |
| payer                         | immut      | no     |      |
| program_approval              | immut      | no     |      |
| routing_manager               | immut      | no     |      |
| net_id                        | immut      | no     |      |
| dc_mint                       | immut      | no     |      |
| authority                     | immut      | no     |      |
| organization                  | immut      | no     |      |
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
| shared_merkle                 | immut      | no     |      |
| token_metadata_program        | immut      | no     |      |
| log_wrapper                   | immut      | no     |      |
| bubblegum_program             | immut      | no     |      |
| compression_program           | immut      | no     |      |
| system_program                | immut      | no     |      |
| helium_entity_manager_program | immut      | no     |      |
| token_program                 | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### temp_backfill_organization_delegate

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| payer                 | immut      | no     |      |
| organization          | immut      | no     |      |
| organization_delegate | immut      | no     |      |
| delegate              | immut      | no     |      |
| system_program        | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### update_net_id_v0

#### Accounts

| Name      | Mutability | Signer | Docs |
| --------- | ---------- | ------ | ---- |
| authority | immut      | no     |      |
| net_id    | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_organization_v0

#### Accounts

| Name         | Mutability | Signer | Docs |
| ------------ | ---------- | ------ | ---- |
| authority    | immut      | no     |      |
| organization | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_routing_manager_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| update_authority | immut      | no     |      |
| routing_manager  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### DaoV0

undefined

### DataCreditsV0

undefined

### DevaddrConstraintV0

undefined

### IotRoutingManagerV0

undefined

### NetIdV0

undefined

### OrganizationDelegateV0

undefined

### OrganizationV0

undefined

### ProgramApprovalV0

undefined

### SharedMerkleV0

undefined

### SubDaoV0

undefined

### TreeConfig

undefined

## Types

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

### DecompressibleState

| Variant  | Fields |
| -------- | ------ |
| Enabled  |        |
| Disabled |        |

### DevaddrConstraintV0

| Field           | Type   |
| --------------- | ------ |
| routing_manager | pubkey |
| net_id          | pubkey |
| organization    | pubkey |
| start_addr      | u64    |
| end_addr        | u64    |
| bump_seed       | u8     |

### EmissionScheduleItem

| Field               | Type |
| ------------------- | ---- |
| start_unix_time     | i64  |
| emissions_per_epoch | u64  |

### InitializeDevaddrConstraintArgsV0

| Field      | Type |
| ---------- | ---- |
| num_blocks | u32  |

### InitializeNetIdArgsV0

| Field  | Type |
| ------ | ---- |
| net_id | u32  |

### InitializeRoutingManagerArgsV0

| Field           | Type   |
| --------------- | ------ |
| metadata_url    | string |
| devaddr_fee_usd | u64    |
| oui_fee_usd     | u64    |

### IotRoutingManagerV0

| Field            | Type   |
| ---------------- | ------ |
| sub_dao          | pubkey |
| dc_mint          | pubkey |
| update_authority | pubkey |
| net_id_authority | pubkey |
| collection       | pubkey |
| devaddr_fee_usd  | u64    |
| oui_fee_usd      | u64    |
| next_oui_id      | u64    |
| bump_seed        | u8     |

### NetIdV0

| Field               | Type   |
| ------------------- | ------ |
| routing_manager     | pubkey |
| id                  | u32    |
| authority           | pubkey |
| current_addr_offset | u64    |
| bump_seed           | u8     |

### OrganizationDelegateV0

| Field        | Type   |
| ------------ | ------ |
| organization | pubkey |
| delegate     | pubkey |
| bump_seed    | u8     |

### OrganizationV0

| Field           | Type   |
| --------------- | ------ |
| routing_manager | pubkey |
| net_id          | pubkey |
| authority       | pubkey |
| oui             | u64    |
| escrow_key      | string |
| approved        | bool   |
| bump_seed       | u8     |

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

### SharedMerkleV0

| Field          | Type   |
| -------------- | ------ |
| proof_size     | u8     |
| price_per_mint | u64    |
| merkle_tree    | pubkey |
| bump_seed      | u8     |

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

### TempBackfillDevaddrConstraintArgs

| Field      | Type |
| ---------- | ---- |
| num_blocks | u32  |
| start_addr | u64  |

### TempBackfillOrganizationArgs

| Field               | Type   |
| ------------------- | ------ |
| oui                 | u64    |
| escrow_key_override | string |

### TreeConfig

| Field               | Type            |
| ------------------- | --------------- |
| tree_creator        | pubkey          |
| tree_delegate       | pubkey          |
| total_mint_capacity | u64             |
| num_minted          | u64             |
| is_public           | bool            |
| is_decompressible   | [object Object] |

### UpdateNetIdArgsV0

| Field     | Type   |
| --------- | ------ |
| authority | pubkey |

### UpdateOrganizationArgsV0

| Field     | Type   |
| --------- | ------ |
| authority | pubkey |

### UpdateRoutingManagerArgsV0

| Field            | Type   |
| ---------------- | ------ |
| update_authority | pubkey |
| net_id_authority | pubkey |
| devaddr_fee_usd  | u64    |
| oui_fee_usd      | u64    |
