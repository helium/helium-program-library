# Helium Sub Daos SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### add_recent_proposal_to_dao_v0

#### Accounts

| Name     | Mutability | Signer | Docs |
| -------- | ---------- | ------ | ---- |
| proposal | immut      | no     |      |
| dao      | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### admin_set_dc_onboarding_fees_paid

#### Accounts

| Name      | Mutability | Signer | Docs |
| --------- | ---------- | ------ | ---- |
| dao       | immut      | no     |      |
| sub_dao   | immut      | no     |      |
| authority | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### admin_set_dc_onboarding_fees_paid_epoch_info

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| dao                | immut      | no     |      |
| sub_dao            | immut      | no     |      |
| sub_dao_epoch_info | immut      | no     |      |
| authority          | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### calculate_utility_score_v0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| payer                   | immut      | no     |      |
| registrar               | immut      | no     |      |
| dao                     | immut      | no     |      |
| hnt_mint                | immut      | no     |      |
| sub_dao                 | immut      | no     |      |
| prev_dao_epoch_info     | immut      | no     |      |
| dao_epoch_info          | immut      | no     |      |
| sub_dao_epoch_info      | immut      | no     |      |
| system_program          | immut      | no     |      |
| token_program           | immut      | no     |      |
| circuit_breaker_program | immut      | no     |      |
| prev_sub_dao_epoch_info | immut      | no     |      |
| not_emitted_counter     | immut      | no     |      |
| no_emit_program         | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### change_delegation_v0

#### Accounts

| Name                                | Mutability | Signer | Docs |
| ----------------------------------- | ---------- | ------ | ---- |
| payer                               | immut      | no     |      |
| position                            | immut      | no     |      |
| mint                                | immut      | no     |      |
| position_token_account              | immut      | no     |      |
| position_authority                  | immut      | no     |      |
| registrar                           | immut      | no     |      |
| dao                                 | immut      | no     |      |
| old_sub_dao                         | immut      | no     |      |
| old_sub_dao_epoch_info              | immut      | no     |      |
| old_closing_time_sub_dao_epoch_info | immut      | no     |      |
| old_genesis_end_sub_dao_epoch_info  | immut      | no     |      |
| sub_dao                             | immut      | no     |      |
| sub_dao_epoch_info                  | immut      | no     |      |
| closing_time_sub_dao_epoch_info     | immut      | no     |      |
| genesis_end_sub_dao_epoch_info      | immut      | no     |      |
| delegated_position                  | immut      | no     |      |
| vsr_program                         | immut      | no     |      |
| system_program                      | immut      | no     |      |
| proxy_config                        | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### claim_rewards_v0

#### Accounts

| Name                           | Mutability | Signer | Docs |
| ------------------------------ | ---------- | ------ | ---- |
| position                       | immut      | no     |      |
| mint                           | immut      | no     |      |
| position_token_account         | immut      | no     |      |
| position_authority             | immut      | no     |      |
| registrar                      | immut      | no     |      |
| dao                            | immut      | no     |      |
| sub_dao                        | immut      | no     |      |
| delegated_position             | immut      | no     |      |
| dnt_mint                       | immut      | no     |      |
| sub_dao_epoch_info             | immut      | no     |      |
| delegator_pool                 | immut      | no     |      |
| delegator_ata                  | immut      | no     |      |
| delegator_pool_circuit_breaker | immut      | no     |      |
| vsr_program                    | immut      | no     |      |
| system_program                 | immut      | no     |      |
| circuit_breaker_program        | immut      | no     |      |
| associated_token_program       | immut      | no     |      |
| token_program                  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### claim_rewards_v1

#### Accounts

| Name                           | Mutability | Signer | Docs |
| ------------------------------ | ---------- | ------ | ---- |
| position                       | immut      | no     |      |
| mint                           | immut      | no     |      |
| position_token_account         | immut      | no     |      |
| position_authority             | immut      | no     |      |
| registrar                      | immut      | no     |      |
| dao                            | immut      | no     |      |
| sub_dao                        | immut      | no     |      |
| delegated_position             | immut      | no     |      |
| hnt_mint                       | immut      | no     |      |
| dao_epoch_info                 | immut      | no     |      |
| delegator_pool                 | immut      | no     |      |
| delegator_ata                  | immut      | no     |      |
| delegator_pool_circuit_breaker | immut      | no     |      |
| vsr_program                    | immut      | no     |      |
| system_program                 | immut      | no     |      |
| circuit_breaker_program        | immut      | no     |      |
| associated_token_program       | immut      | no     |      |
| token_program                  | immut      | no     |      |
| payer                          | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### close_delegation_v0

#### Accounts

| Name                            | Mutability | Signer | Docs |
| ------------------------------- | ---------- | ------ | ---- |
| payer                           | immut      | no     |      |
| position                        | immut      | no     |      |
| mint                            | immut      | no     |      |
| position_token_account          | immut      | no     |      |
| position_authority              | immut      | no     |      |
| registrar                       | immut      | no     |      |
| dao                             | immut      | no     |      |
| sub_dao                         | immut      | no     |      |
| delegated_position              | immut      | no     |      |
| sub_dao_epoch_info              | immut      | no     |      |
| closing_time_sub_dao_epoch_info | immut      | no     |      |
| genesis_end_sub_dao_epoch_info  | immut      | no     |      |
| vsr_program                     | immut      | no     |      |
| system_program                  | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### delegate_v0

#### Accounts

| Name                            | Mutability | Signer | Docs |
| ------------------------------- | ---------- | ------ | ---- |
| payer                           | immut      | no     |      |
| position                        | immut      | no     |      |
| mint                            | immut      | no     |      |
| position_token_account          | immut      | no     |      |
| position_authority              | immut      | no     |      |
| registrar                       | immut      | no     |      |
| dao                             | immut      | no     |      |
| sub_dao                         | immut      | no     |      |
| sub_dao_epoch_info              | immut      | no     |      |
| closing_time_sub_dao_epoch_info | immut      | no     |      |
| genesis_end_sub_dao_epoch_info  | immut      | no     |      |
| delegated_position              | immut      | no     |      |
| vsr_program                     | immut      | no     |      |
| system_program                  | immut      | no     |      |
| proxy_config                    | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### extend_expiration_ts_v0

#### Accounts

| Name                                | Mutability | Signer | Docs |
| ----------------------------------- | ---------- | ------ | ---- |
| payer                               | immut      | no     |      |
| position                            | immut      | no     |      |
| mint                                | immut      | no     |      |
| position_token_account              | immut      | no     |      |
| authority                           | immut      | no     |      |
| registrar                           | immut      | no     |      |
| dao                                 | immut      | no     |      |
| sub_dao                             | immut      | no     |      |
| delegated_position                  | immut      | no     |      |
| old_closing_time_sub_dao_epoch_info | immut      | no     |      |
| closing_time_sub_dao_epoch_info     | immut      | no     |      |
| genesis_end_sub_dao_epoch_info      | immut      | no     |      |
| proxy_config                        | immut      | no     |      |
| system_program                      | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_dao_v0

#### Accounts

| Name                           | Mutability | Signer | Docs |
| ------------------------------ | ---------- | ------ | ---- |
| payer                          | immut      | no     |      |
| dao                            | immut      | no     |      |
| hnt_mint                       | immut      | no     |      |
| hnt_mint_authority             | immut      | no     |      |
| hnt_freeze_authority           | immut      | no     |      |
| hnt_circuit_breaker            | immut      | no     |      |
| dc_mint                        | immut      | no     |      |
| hst_pool                       | immut      | no     |      |
| system_program                 | immut      | no     |      |
| token_program                  | immut      | no     |      |
| circuit_breaker_program        | immut      | no     |      |
| delegator_pool_circuit_breaker | immut      | no     |      |
| rewards_escrow                 | immut      | no     |      |
| delegator_pool                 | immut      | no     |      |
| associated_token_program       | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_hnt_delegator_pool

#### Accounts

| Name                           | Mutability | Signer | Docs |
| ------------------------------ | ---------- | ------ | ---- |
| payer                          | immut      | no     |      |
| dao                            | immut      | no     |      |
| authority                      | immut      | no     |      |
| hnt_mint                       | immut      | no     |      |
| delegator_pool_circuit_breaker | immut      | no     |      |
| delegator_pool                 | immut      | no     |      |
| system_program                 | immut      | no     |      |
| token_program                  | immut      | no     |      |
| circuit_breaker_program        | immut      | no     |      |
| associated_token_program       | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_sub_dao_v0

#### Accounts

| Name                        | Mutability | Signer | Docs |
| --------------------------- | ---------- | ------ | ---- |
| payer                       | immut      | no     |      |
| dao                         | immut      | no     |      |
| authority                   | immut      | no     |      |
| sub_dao                     | immut      | no     |      |
| hnt_mint                    | immut      | no     |      |
| dnt_mint                    | immut      | no     |      |
| dnt_mint_authority          | immut      | no     |      |
| sub_dao_freeze_authority    | immut      | no     |      |
| treasury                    | immut      | no     |      |
| treasury_circuit_breaker    | immut      | no     |      |
| treasury_management         | immut      | no     |      |
| system_program              | immut      | no     |      |
| token_program               | immut      | no     |      |
| treasury_management_program | immut      | no     |      |
| circuit_breaker_program     | immut      | no     |      |
| associated_token_program    | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### issue_rewards_v0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| dao                     | immut      | no     |      |
| sub_dao                 | immut      | no     |      |
| dao_epoch_info          | immut      | no     |      |
| sub_dao_epoch_info      | immut      | no     |      |
| hnt_circuit_breaker     | immut      | no     |      |
| hnt_mint                | immut      | no     |      |
| dnt_mint                | immut      | no     |      |
| treasury                | immut      | no     |      |
| rewards_escrow          | immut      | no     |      |
| delegator_pool          | immut      | no     |      |
| system_program          | immut      | no     |      |
| token_program           | immut      | no     |      |
| circuit_breaker_program | immut      | no     |      |
| prev_sub_dao_epoch_info | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### reset_lockup_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| registrar              | immut      | no     |      |
| dao                    | immut      | no     |      |
| position               | immut      | no     |      |
| delegated_position     | immut      | no     |      |
| mint                   | immut      | no     |      |
| position_token_account | immut      | no     |      |
| position_authority     | immut      | no     |      |
| vsr_program            | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### switch_mobile_ops_fund

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| authority                | immut      | no     |      |
| ops_fund_mobile          | immut      | no     |      |
| mobile_mint              | immut      | no     |      |
| ops_fund_hnt             | immut      | no     |      |
| dao                      | immut      | no     |      |
| hnt_mint                 | immut      | no     |      |
| hnt_circuit_breaker      | immut      | no     |      |
| circuit_breaker_program  | immut      | no     |      |
| system_program           | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### temp_backfill_dao_recent_proposals

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| authority      | immut      | no     |      |
| dao            | immut      | no     |      |
| dao_epoch_info | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### temp_claim_buggy_rewards

#### Accounts

| Name                           | Mutability | Signer | Docs |
| ------------------------------ | ---------- | ------ | ---- |
| position                       | immut      | no     |      |
| mint                           | immut      | no     |      |
| authority                      | immut      | no     |      |
| position_authority             | immut      | no     |      |
| registrar                      | immut      | no     |      |
| dao                            | immut      | no     |      |
| sub_dao                        | immut      | no     |      |
| delegated_position             | immut      | no     |      |
| dnt_mint                       | immut      | no     |      |
| sub_dao_epoch_info             | immut      | no     |      |
| delegator_pool                 | immut      | no     |      |
| delegator_ata                  | immut      | no     |      |
| delegator_pool_circuit_breaker | immut      | no     |      |
| vsr_program                    | immut      | no     |      |
| system_program                 | immut      | no     |      |
| circuit_breaker_program        | immut      | no     |      |
| associated_token_program       | immut      | no     |      |
| token_program                  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### temp_update_sub_dao_epoch_info

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| sub_dao_epoch_info | immut      | no     |      |
| sub_dao            | immut      | no     |      |
| authority          | immut      | no     |      |
| system_program     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### track_dc_burn_v0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| sub_dao_epoch_info | immut      | no     |      |
| sub_dao            | immut      | no     |      |
| registrar          | immut      | no     |      |
| dao                | immut      | no     |      |
| dc_mint            | immut      | no     |      |
| account_payer      | immut      | no     |      |
| system_program     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### track_dc_onboarding_fees_v0

#### Accounts

| Name     | Mutability | Signer | Docs |
| -------- | ---------- | ------ | ---- |
| hem_auth | immut      | no     |      |
| sub_dao  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### track_vote_v0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| payer              | immut      | no     |      |
| proposal           | immut      | no     |      |
| registrar          | immut      | no     |      |
| position           | immut      | no     |      |
| mint               | immut      | no     |      |
| marker             | immut      | no     |      |
| dao                | immut      | no     |      |
| sub_dao            | immut      | no     |      |
| delegated_position | immut      | no     |      |
| dao_epoch_info     | immut      | no     |      |
| vsr_program        | immut      | no     |      |
| system_program     | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### transfer_v0

#### Accounts

| Name                      | Mutability | Signer | Docs |
| ------------------------- | ---------- | ------ | ---- |
| registrar                 | immut      | no     |      |
| dao                       | immut      | no     |      |
| source_position           | immut      | no     |      |
| source_delegated_position | immut      | no     |      |
| mint                      | immut      | no     |      |
| position_token_account    | immut      | no     |      |
| position_authority        | immut      | no     |      |
| target_position           | immut      | no     |      |
| target_delegated_position | immut      | no     |      |
| deposit_mint              | immut      | no     |      |
| source_vault              | immut      | no     |      |
| target_vault              | immut      | no     |      |
| vsr_program               | immut      | no     |      |
| token_program             | immut      | no     |      |
| associated_token_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_dao_v0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| payer          | immut      | no     |      |
| dao            | immut      | no     |      |
| authority      | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_sub_dao_v0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| payer          | immut      | no     |      |
| sub_dao        | immut      | no     |      |
| authority      | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_sub_dao_vehnt_v0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| sub_dao        | immut      | no     |      |
| authority      | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### AccountWindowedCircuitBreakerV0

undefined

### DaoEpochInfoV0

undefined

### DaoV0

undefined

### DelegatedPositionV0

undefined

### MintWindowedCircuitBreakerV0

undefined

### PositionV0

undefined

### ProposalV0

undefined

### ProxyConfigV0

undefined

### Registrar

undefined

### SubDaoEpochInfoV0

undefined

### SubDaoV0

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

### AdminSetDcOnboardingFeesPaidArgs

| Field                   | Type |
| ----------------------- | ---- |
| dc_onboarding_fees_paid | u64  |

### AdminSetDcOnboardingFeesPaidEpochInfoArgs

| Field                   | Type |
| ----------------------- | ---- |
| dc_onboarding_fees_paid | u64  |

### CalculateUtilityScoreArgsV0

| Field | Type |
| ----- | ---- |
| epoch | u64  |

### Choice

| Field  | Type   |
| ------ | ------ |
| weight | u128   |
| name   | string |
| uri    | string |

### ClaimRewardsArgsV0

| Field | Type |
| ----- | ---- |
| epoch | u64  |

### Curve

| Variant            | Fields  |
| ------------------ | ------- |
| ExponentialCurveV0 | k: u128 |

### DaoEpochInfoV0

| Field                         | Type            |
| ----------------------------- | --------------- |
| done_calculating_scores       | bool            |
| epoch                         | u64             |
| dao                           | pubkey          |
| total_rewards                 | u64             |
| current_hnt_supply            | u64             |
| total_utility_score           | u128            |
| num_utility_scores_calculated | u32             |
| num_rewards_issued            | u32             |
| done_issuing_rewards          | bool            |
| done_issuing_hst_pool         | bool            |
| bump_seed                     | u8              |
| recent_proposals              | [object Object] |
| delegation_rewards_issued     | u64             |
| vehnt_at_epoch_start          | u64             |
| cumulative_not_emitted        | u64             |
| not_emitted                   | u64             |
| smoothed_hnt_burned           | u64             |

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

### DelegatedPositionV0

| Field                         | Type            |
| ----------------------------- | --------------- |
| mint                          | pubkey          |
| position                      | pubkey          |
| hnt_amount                    | u64             |
| sub_dao                       | pubkey          |
| last_claimed_epoch            | u64             |
| start_ts                      | i64             |
| purged                        | bool            |
| bump_seed                     | u8              |
| claimed_epochs_bitmap         | u128            |
| expiration_ts                 | i64             |
| \_deprecated_recent_proposals | [object Object] |

### EmissionScheduleItem

| Field               | Type |
| ------------------- | ---- |
| start_unix_time     | i64  |
| emissions_per_epoch | u64  |

### InitializeDaoArgsV0

| Field                     | Type            |
| ------------------------- | --------------- |
| authority                 | pubkey          |
| emission_schedule         | [object Object] |
| hst_emission_schedule     | [object Object] |
| net_emissions_cap         | u64             |
| registrar                 | pubkey          |
| proposal_namespace        | pubkey          |
| delegator_rewards_percent | u64             |

### InitializeSubDaoArgsV0

| Field                       | Type            |
| --------------------------- | --------------- |
| authority                   | pubkey          |
| emission_schedule           | [object Object] |
| treasury_curve              | [object Object] |
| onboarding_dc_fee           | u64             |
| dc_burn_authority           | pubkey          |
| registrar                   | pubkey          |
| onboarding_data_only_dc_fee | u64             |
| active_device_authority     | pubkey          |

### IssueRewardsArgsV0

| Field | Type |
| ----- | ---- |
| epoch | u64  |

### Lockup

| Field    | Type            |
| -------- | --------------- |
| start_ts | i64             |
| end_ts   | i64             |
| kind     | [object Object] |

### LockupKind

| Variant  | Fields |
| -------- | ------ |
| None     |        |
| Cliff    |        |
| Constant |        |

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

### PositionV0

| Field                   | Type            |
| ----------------------- | --------------- |
| registrar               | pubkey          |
| mint                    | pubkey          |
| lockup                  | [object Object] |
| amount_deposited_native | u64             |
| voting_mint_config_idx  | u8              |
| num_active_votes        | u16             |
| genesis_end             | i64             |
| bump_seed               | u8              |
| vote_controller         | pubkey          |
| registrar_paid_rent     | u64             |
| recent_proposals        | [object Object] |

### ProposalState

| Variant   | Fields                                |
| --------- | ------------------------------------- |
| Draft     |                                       |
| Cancelled |                                       |
| Voting    | start_ts: i64                         |
| Resolved  | choices: [object Object], end_ts: i64 |
| Custom    | name: string, bin: bytes              |

### ProposalV0

| Field                 | Type            |
| --------------------- | --------------- |
| namespace             | pubkey          |
| owner                 | pubkey          |
| state                 | [object Object] |
| created_at            | i64             |
| proposal_config       | pubkey          |
| max_choices_per_voter | u16             |
| seed                  | bytes           |
| name                  | string          |
| uri                   | string          |
| tags                  | string          |
| choices               | [object Object] |
| bump_seed             | u8              |

### ProxyConfigV0

| Field          | Type            |
| -------------- | --------------- |
| authority      | pubkey          |
| name           | string          |
| max_proxy_time | i64             |
| seasons        | [object Object] |

### RecentProposal

| Field    | Type   |
| -------- | ------ |
| proposal | pubkey |
| ts       | i64    |

### Registrar

| Field                      | Type            |
| -------------------------- | --------------- |
| governance_program_id      | pubkey          |
| realm                      | pubkey          |
| realm_governing_token_mint | pubkey          |
| realm_authority            | pubkey          |
| time_offset                | i64             |
| position_update_authority  | pubkey          |
| collection                 | pubkey          |
| bump_seed                  | u8              |
| collection_bump_seed       | u8              |
| reserved1                  | [object Object] |
| reserved2                  | [object Object] |
| proxy_config               | pubkey          |
| voting_mints               | [object Object] |

### ResetLockupArgsV0

| Field   | Type            |
| ------- | --------------- |
| kind    | [object Object] |
| periods | u32             |

### SeasonV0

| Field | Type |
| ----- | ---- |
| start | i64  |
| end   | i64  |

### SubDaoEpochInfoV0

| Field                             | Type   |
| --------------------------------- | ------ |
| epoch                             | u64    |
| sub_dao                           | pubkey |
| dc_burned                         | u64    |
| vehnt_at_epoch_start              | u64    |
| vehnt_in_closing_positions        | u128   |
| fall_rates_from_closing_positions | u128   |
| delegation_rewards_issued         | u64    |
| utility_score                     | u128   |
| rewards_issued_at                 | i64    |
| bump_seed                         | u8     |
| initialized                       | bool   |
| dc_onboarding_fees_paid           | u64    |
| hnt_rewards_issued                | u64    |
| previous_percentage               | u32    |

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

### TempUpdateSubDaoEpochInfoArgs

| Field                             | Type |
| --------------------------------- | ---- |
| vehnt_in_closing_positions        | u128 |
| fall_rates_from_closing_positions | u128 |
| epoch                             | u64  |

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### TrackDcBurnArgsV0

| Field     | Type |
| --------- | ---- |
| dc_burned | u64  |
| bump      | u8   |

### TrackDcOnboardingFeesArgsV0

| Field  | Type   |
| ------ | ------ |
| amount | u64    |
| add    | bool   |
| symbol | string |

### TransferArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### UpdateDaoArgsV0

| Field                     | Type            |
| ------------------------- | --------------- |
| authority                 | pubkey          |
| emission_schedule         | [object Object] |
| hst_emission_schedule     | [object Object] |
| hst_pool                  | pubkey          |
| net_emissions_cap         | u64             |
| proposal_namespace        | pubkey          |
| delegator_rewards_percent | u64             |
| rewards_escrow            | pubkey          |

### UpdateSubDaoArgsV0

| Field                       | Type            |
| --------------------------- | --------------- |
| authority                   | pubkey          |
| emission_schedule           | [object Object] |
| onboarding_dc_fee           | u64             |
| dc_burn_authority           | pubkey          |
| registrar                   | pubkey          |
| onboarding_data_only_dc_fee | u64             |
| active_device_authority     | pubkey          |

### UpdateSubDaoVeHntArgsV0

| Field                    | Type |
| ------------------------ | ---- |
| vehnt_delegated          | u128 |
| vehnt_last_calculated_ts | i64  |
| vehnt_fall_rate          | u128 |

### VotingMintConfigV0

| Field                                       | Type   |
| ------------------------------------------- | ------ |
| mint                                        | pubkey |
| baseline_vote_weight_scaled_factor          | u64    |
| max_extra_lockup_vote_weight_scaled_factor  | u64    |
| genesis_vote_power_multiplier               | u8     |
| genesis_vote_power_multiplier_expiration_ts | i64    |
| lockup_saturation_secs                      | u64    |
| reserved                                    | i8     |

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
