# Voter Stake Registry SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### clear_recent_proposals_v0

#### Accounts

| Name      | Mutability | Signer | Docs |
| --------- | ---------- | ------ | ---- |
| registrar | immut      | no     |      |
| position  | immut      | no     |      |
| dao       | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### close_position_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| sol_destination        | immut      | no     |      |
| position               | immut      | no     |      |
| registrar              | immut      | no     |      |
| mint                   | immut      | no     |      |
| position_token_account | immut      | no     |      |
| position_authority     | immut      | no     |      |
| token_program          | immut      | no     |      |
| token_metadata_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### configure_voting_mint_v0

#### Accounts

| Name            | Mutability | Signer | Docs                                         |
| --------------- | ---------- | ------ | -------------------------------------------- |
| registrar       | immut      | no     |                                              |
| realm_authority | immut      | no     |                                              |
| mint            | immut      | no     | Tokens of this mint will produce vote weight |
| payer           | immut      | no     |                                              |
| system_program  | immut      | no     |                                              |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### count_proxy_vote_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| payer            | immut      | no     |      |
| marker           | immut      | no     |      |
| registrar        | immut      | no     |      |
| voter            | immut      | no     |      |
| proxy_marker     | immut      | no     |      |
| position         | immut      | no     |      |
| proxy_assignment | immut      | no     |      |
| proposal         | immut      | no     |      |
| proposal_config  | immut      | no     |      |
| state_controller | immut      | no     |      |
| on_vote_hook     | immut      | no     |      |
| proposal_program | immut      | no     |      |
| system_program   | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### deposit_v0

#### Accounts

| Name              | Mutability | Signer | Docs |
| ----------------- | ---------- | ------ | ---- |
| registrar         | immut      | no     |      |
| position          | immut      | no     |      |
| vault             | immut      | no     |      |
| mint              | immut      | no     |      |
| deposit_token     | immut      | no     |      |
| deposit_authority | immut      | no     |      |
| token_program     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_position_v0

#### Accounts

| Name                      | Mutability | Signer | Docs |
| ------------------------- | ---------- | ------ | ---- |
| registrar                 | immut      | no     |      |
| collection                | immut      | no     |      |
| collection_metadata       | immut      | no     |      |
| collection_master_edition | immut      | no     |      |
| position                  | immut      | no     |      |
| mint                      | immut      | no     |      |
| metadata                  | immut      | no     |      |
| master_edition            | immut      | no     |      |
| position_token_account    | immut      | no     |      |
| recipient                 | immut      | no     |      |
| vault                     | immut      | no     |      |
| payer                     | immut      | no     |      |
| deposit_mint              | immut      | no     |      |
| system_program            | immut      | no     |      |
| token_program             | immut      | no     |      |
| associated_token_program  | immut      | no     |      |
| token_metadata_program    | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_registrar_v0

#### Accounts

| Name                       | Mutability | Signer | Docs                                                                                                                                                                                                                 |
| -------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| registrar                  | immut      | no     | The voting registrar. There can only be a single registrar per governance realm and governing mint.                                                                                                                  |
| collection                 | immut      | no     |                                                                                                                                                                                                                      |
| metadata                   | immut      | no     |                                                                                                                                                                                                                      |
| master_edition             | immut      | no     |                                                                                                                                                                                                                      |
| token_account              | immut      | no     |                                                                                                                                                                                                                      |
| realm                      | immut      | no     | An spl-governance realm realm is validated in the instruction: - realm is owned by the governance_program_id - realm_governing_token_mint must be the community or council mint - realm_authority is realm.authority |
| governance_program_id      | immut      | no     | The program id of the spl-governance program the realm belongs to.                                                                                                                                                   |
| realm_governing_token_mint | immut      | no     | Either the realm community mint or the council mint.                                                                                                                                                                 |
| realm_authority            | immut      | no     |                                                                                                                                                                                                                      |
| payer                      | immut      | no     |                                                                                                                                                                                                                      |
| token_metadata_program     | immut      | no     |                                                                                                                                                                                                                      |
| associated_token_program   | immut      | no     |                                                                                                                                                                                                                      |
| system_program             | immut      | no     |                                                                                                                                                                                                                      |
| token_program              | immut      | no     |                                                                                                                                                                                                                      |
| proxy_config               | immut      | no     |                                                                                                                                                                                                                      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### ledger_transfer_position_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| position                 | immut      | no     |      |
| mint                     | immut      | no     |      |
| from_token_account       | immut      | no     |      |
| to_token_account         | immut      | no     |      |
| from                     | immut      | no     |      |
| to                       | immut      | no     |      |
| approver                 | immut      | no     |      |
| system_program           | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### proxied_relinquish_vote_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| rent_refund      | immut      | no     |      |
| marker           | immut      | no     |      |
| registrar        | immut      | no     |      |
| voter            | immut      | no     |      |
| proxy_assignment | immut      | no     |      |
| position         | immut      | no     |      |
| mint             | immut      | no     |      |
| proposal         | immut      | no     |      |
| proposal_config  | immut      | no     |      |
| state_controller | immut      | no     |      |
| on_vote_hook     | immut      | no     |      |
| proposal_program | immut      | no     |      |
| system_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### proxied_relinquish_vote_v1

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| marker         | immut      | no     |      |
| voter          | immut      | no     |      |
| proposal       | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### proxied_vote_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| payer            | immut      | no     |      |
| marker           | immut      | no     |      |
| registrar        | immut      | no     |      |
| voter            | immut      | no     |      |
| position         | immut      | no     |      |
| proxy_assignment | immut      | no     |      |
| proposal         | immut      | no     |      |
| proposal_config  | immut      | no     |      |
| state_controller | immut      | no     |      |
| on_vote_hook     | immut      | no     |      |
| proposal_program | immut      | no     |      |
| system_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### proxied_vote_v1

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| payer          | immut      | no     |      |
| marker         | immut      | no     |      |
| voter          | immut      | no     |      |
| proposal       | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### relinquish_expired_proxy_vote_v0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| rent_refund    | immut      | no     |      |
| marker         | immut      | no     |      |
| proposal       | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### relinquish_expired_vote_v0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| rent_refund    | immut      | no     |      |
| marker         | immut      | no     |      |
| position       | immut      | no     |      |
| proposal       | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### relinquish_vote_v1

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| marker           | immut      | no     |      |
| registrar        | immut      | no     |      |
| voter            | immut      | no     |      |
| position         | immut      | no     |      |
| mint             | immut      | no     |      |
| token_account    | immut      | no     |      |
| proposal         | immut      | no     |      |
| proposal_config  | immut      | no     |      |
| state_controller | immut      | no     |      |
| on_vote_hook     | immut      | no     |      |
| proposal_program | immut      | no     |      |
| system_program   | immut      | no     |      |
| rent_refund      | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### reset_lockup_v0

#### Accounts

| Name                      | Mutability | Signer | Docs |
| ------------------------- | ---------- | ------ | ---- |
| registrar                 | immut      | no     |      |
| position_update_authority | immut      | no     |      |
| position                  | immut      | no     |      |
| mint                      | immut      | no     |      |
| position_token_account    | immut      | no     |      |
| position_authority        | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### set_time_offset_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| registrar       | immut      | no     |      |
| realm_authority | immut      | no     |      |

#### Args

| Name        | Type      | Docs |
| ----------- | --------- | ---- |
| time_offset | undefined |      |

### temp_backfill_proxy_marker

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| payer          | immut      | no     |      |
| marker         | immut      | no     |      |
| voter          | immut      | no     |      |
| authority      | immut      | no     |      |
| proposal       | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### temp_backfill_recent_proposals

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| authority      | immut      | no     |      |
| registrar      | immut      | no     |      |
| position       | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### temp_release_position_v0

#### Accounts

| Name      | Mutability | Signer | Docs |
| --------- | ---------- | ------ | ---- |
| authority | immut      | no     |      |
| position  | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### transfer_v0

#### Accounts

| Name                      | Mutability | Signer | Docs |
| ------------------------- | ---------- | ------ | ---- |
| registrar                 | immut      | no     |      |
| position_update_authority | immut      | no     |      |
| source_position           | immut      | no     |      |
| mint                      | immut      | no     |      |
| position_token_account    | immut      | no     |      |
| position_authority        | immut      | no     |      |
| target_position           | immut      | no     |      |
| deposit_mint              | immut      | no     |      |
| source_vault              | immut      | no     |      |
| target_vault              | immut      | no     |      |
| token_program             | immut      | no     |      |
| associated_token_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_registrar_authority_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| registrar       | immut      | no     |      |
| realm_authority | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_registrar_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| registrar       | immut      | no     |      |
| realm_authority | immut      | no     |      |
| proxy_config    | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### vote_v0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| payer            | immut      | no     |      |
| marker           | immut      | no     |      |
| registrar        | immut      | no     |      |
| voter            | immut      | no     |      |
| position         | immut      | no     |      |
| mint             | immut      | no     |      |
| token_account    | immut      | no     |      |
| proposal         | immut      | no     |      |
| proposal_config  | immut      | no     |      |
| state_controller | immut      | no     |      |
| on_vote_hook     | immut      | no     |      |
| proposal_program | immut      | no     |      |
| system_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### withdraw_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| position_authority       | immut      | no     |      |
| registrar                | immut      | no     |      |
| position                 | immut      | no     |      |
| mint                     | immut      | no     |      |
| position_token_account   | immut      | no     |      |
| vault                    | immut      | no     |      |
| deposit_mint             | immut      | no     |      |
| destination              | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| token_program            | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### PositionV0

undefined

### ProposalConfigV0

undefined

### ProposalV0

undefined

### ProxyAssignmentV0

undefined

### ProxyConfigV0

undefined

### ProxyMarkerV0

undefined

### Registrar

undefined

### VoteMarkerV0

undefined

## Types

### Choice

| Field  | Type   |
| ------ | ------ |
| weight | u128   |
| name   | string |
| uri    | string |

### ClearRecentProposalsArgsV0

| Field    | Type |
| -------- | ---- |
| ts       | i64  |
| dao_bump | u8   |

### ConfigureVotingMintArgsV0

| Field                                       | Type |
| ------------------------------------------- | ---- |
| idx                                         | u16  |
| baseline_vote_weight_scaled_factor          | u64  |
| max_extra_lockup_vote_weight_scaled_factor  | u64  |
| genesis_vote_power_multiplier               | u8   |
| genesis_vote_power_multiplier_expiration_ts | i64  |
| lockup_saturation_secs                      | u64  |

### DepositArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### InitializePositionArgsV0

| Field   | Type            |
| ------- | --------------- |
| kind    | [object Object] |
| periods | u32             |

### InitializeRegistrarArgsV0

| Field                     | Type   |
| ------------------------- | ------ |
| position_update_authority | pubkey |

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

### ProposalConfigV0

| Field            | Type   |
| ---------------- | ------ |
| vote_controller  | pubkey |
| state_controller | pubkey |
| on_vote_hook     | pubkey |
| name             | string |
| bump_seed        | u8     |

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

### ProxyAssignmentV0

| Field           | Type   |
| --------------- | ------ |
| voter           | pubkey |
| proxy_config    | pubkey |
| asset           | pubkey |
| index           | u16    |
| next_voter      | pubkey |
| rent_refund     | pubkey |
| expiration_time | i64    |
| bump_seed       | u8     |

### ProxyConfigV0

| Field          | Type            |
| -------------- | --------------- |
| authority      | pubkey          |
| name           | string          |
| max_proxy_time | i64             |
| seasons        | [object Object] |

### ProxyMarkerV0

| Field       | Type   |
| ----------- | ------ |
| voter       | pubkey |
| proposal    | pubkey |
| choices     | u16    |
| bump_seed   | u8     |
| rent_refund | pubkey |

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

### RelinquishVoteArgsV1

| Field  | Type |
| ------ | ---- |
| choice | u16  |

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

### TempBackfillRecentProposalsArgs

| Field            | Type            |
| ---------------- | --------------- |
| recent_proposals | [object Object] |

### TransferArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### UpdateRegistrarAuthorityArgsV0

| Field     | Type   |
| --------- | ------ |
| authority | pubkey |

### VoteArgsV0

| Field  | Type |
| ------ | ---- |
| choice | u16  |

### VoteMarkerV0

| Field                     | Type   |
| ------------------------- | ------ |
| voter                     | pubkey |
| registrar                 | pubkey |
| proposal                  | pubkey |
| mint                      | pubkey |
| choices                   | u16    |
| weight                    | u128   |
| bump_seed                 | u8     |
| \_deprecated_relinquished | bool   |
| proxy_index               | u16    |
| rent_refund               | pubkey |

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

### WithdrawArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |
