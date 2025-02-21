# Hpl Crons SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### add_entity_to_cron_v0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| payer                | immut      | no     |      |
| user_authority       | immut      | no     |      |
| authority            | immut      | no     |      |
| key_to_asset         | immut      | no     |      |
| cron_job             | immut      | no     |      |
| cron_job_transaction | immut      | no     |      |
| system_program       | immut      | no     |      |
| cron_program         | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### close_delegation_claim_bot_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| rent_refund            | immut      | no     |      |
| delegation_claim_bot   | immut      | no     |      |
| task_queue             | immut      | no     |      |
| delegated_position     | immut      | no     |      |
| position               | immut      | no     |      |
| position_authority     | immut      | no     |      |
| mint                   | immut      | no     |      |
| position_token_account | immut      | no     |      |
| system_program         | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### init_delegation_claim_bot_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | immut      | no     |      |
| delegation_claim_bot   | immut      | no     |      |
| task_queue             | immut      | no     |      |
| delegated_position     | immut      | no     |      |
| position               | immut      | no     |      |
| position_authority     | immut      | no     |      |
| mint                   | immut      | no     |      |
| position_token_account | immut      | no     |      |
| system_program         | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### init_entity_claim_cron_v0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| payer                 | immut      | no     |      |
| queue_authority       | immut      | no     |      |
| task_queue_authority  | immut      | no     |      |
| user_authority        | immut      | no     |      |
| authority             | immut      | no     |      |
| user_cron_jobs        | immut      | no     |      |
| cron_job              | immut      | no     |      |
| cron_job_name_mapping | immut      | no     |      |
| task_queue            | immut      | no     |      |
| task                  | immut      | no     |      |
| task_return_account_1 | immut      | no     |      |
| task_return_account_2 | immut      | no     |      |
| system_program        | immut      | no     |      |
| tuktuk_program        | immut      | no     |      |
| cron_program          | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### init_epoch_tracker

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| payer          | immut      | no     |      |
| epoch_tracker  | immut      | no     |      |
| dao            | immut      | no     |      |
| authority      | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### queue_delegation_claim_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| rent_refund            | immut      | no     |      |
| delegation_claim_bot   | immut      | no     |      |
| payer                  | immut      | no     |      |
| position_claim_payer   | immut      | no     |      |
| task_queue             | immut      | no     |      |
| delegated_position     | immut      | no     |      |
| sub_dao                | immut      | no     |      |
| dao                    | immut      | no     |      |
| hnt_mint               | immut      | no     |      |
| position               | immut      | no     |      |
| position_authority     | immut      | no     |      |
| mint                   | immut      | no     |      |
| position_token_account | immut      | no     |      |
| delegator_ata          | immut      | no     |      |
| task_return_account    | immut      | no     |      |
| system_program         | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### queue_end_epoch

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| payer               | immut      | no     |      |
| epoch_tracker       | immut      | no     |      |
| dao                 | immut      | no     |      |
| iot_sub_dao         | immut      | no     |      |
| mobile_sub_dao      | immut      | no     |      |
| task_return_account | immut      | no     |      |
| task_queue          | immut      | no     |      |
| system_program      | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### queue_relinquish_expired_vote_marker_v0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| payer           | immut      | no     |      |
| voter           | immut      | no     |      |
| marker          | immut      | no     |      |
| position        | immut      | no     |      |
| queue_authority | immut      | no     |      |
| task_queue      | immut      | no     |      |
| task            | immut      | no     |      |
| tuktuk_program  | immut      | no     |      |
| system_program  | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### remove_entity_from_cron_v0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| rent_refund          | immut      | no     |      |
| user_authority       | immut      | no     |      |
| authority            | immut      | no     |      |
| cron_job             | immut      | no     |      |
| cron_job_transaction | immut      | no     |      |
| system_program       | immut      | no     |      |
| cron_program         | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### requeue_entity_claim_cron_v0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| payer                 | immut      | no     |      |
| queue_authority       | immut      | no     |      |
| task_queue_authority  | immut      | no     |      |
| user_authority        | immut      | no     |      |
| authority             | immut      | no     |      |
| user_cron_jobs        | immut      | no     |      |
| cron_job              | immut      | no     |      |
| cron_job_name_mapping | immut      | no     |      |
| task_queue            | immut      | no     |      |
| task                  | immut      | no     |      |
| task_return_account_1 | immut      | no     |      |
| task_return_account_2 | immut      | no     |      |
| system_program        | immut      | no     |      |
| tuktuk_program        | immut      | no     |      |
| cron_program          | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### start_delegation_claim_bot_v0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | immut      | no     |      |
| queue_authority        | immut      | no     |      |
| delegation_claim_bot   | immut      | no     |      |
| task_queue             | immut      | no     |      |
| task_queue_authority   | immut      | no     |      |
| task                   | immut      | no     |      |
| delegated_position     | immut      | no     |      |
| sub_dao                | immut      | no     |      |
| dao                    | immut      | no     |      |
| hnt_mint               | immut      | no     |      |
| position_authority     | immut      | no     |      |
| mint                   | immut      | no     |      |
| position_token_account | immut      | no     |      |
| delegator_ata          | immut      | no     |      |
| system_program         | immut      | no     |      |
| tuktuk_program         | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_epoch_tracker

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| authority     | immut      | no     |      |
| epoch_tracker | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### CronJobV0

undefined

### DaoV0

undefined

### DelegatedPositionV0

undefined

### DelegationClaimBotV0

undefined

### EpochTrackerV0

undefined

### KeyToAssetV0

undefined

### PositionV0

undefined

### SubDaoV0

undefined

### TaskQueueAuthorityV0

undefined

### TaskQueueV0

undefined

### VoteMarkerV0

undefined

## Types

### AddEntityToCronArgsV0

| Field | Type |
| ----- | ---- |
| index | u32  |

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

### CronJobV0

| Field                      | Type   |
| -------------------------- | ------ |
| id                         | u32    |
| user_cron_jobs             | pubkey |
| task_queue                 | pubkey |
| authority                  | pubkey |
| free_tasks_per_transaction | u8     |
| num_tasks_per_queue_call   | u8     |
| schedule                   | string |
| name                       | string |
| current_exec_ts            | i64    |
| current_transaction_id     | u32    |
| num_transactions           | u32    |
| next_transaction_id        | u32    |
| removed_from_queue         | bool   |
| bump_seed                  | u8     |

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

| Field                 | Type            |
| --------------------- | --------------- |
| mint                  | pubkey          |
| position              | pubkey          |
| hnt_amount            | u64             |
| sub_dao               | pubkey          |
| last_claimed_epoch    | u64             |
| start_ts              | i64             |
| purged                | bool            |
| bump_seed             | u8              |
| claimed_epochs_bitmap | u128            |
| expiration_ts         | i64             |
| recent_proposals      | [object Object] |

### DelegationClaimBotV0

| Field              | Type   |
| ------------------ | ------ |
| delegated_position | pubkey |
| task_queue         | pubkey |
| rent_refund        | pubkey |
| bump_seed          | u8     |
| last_claimed_epoch | u64    |
| queued             | bool   |

### EmissionScheduleItem

| Field               | Type |
| ------------------- | ---- |
| start_unix_time     | i64  |
| emissions_per_epoch | u64  |

### EpochTrackerV0

| Field     | Type   |
| --------- | ------ |
| authority | pubkey |
| dao       | pubkey |
| epoch     | u64    |
| bump_seed | u8     |

### InitEntityClaimCronArgsV0

| Field    | Type   |
| -------- | ------ |
| schedule | string |

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

### QueueRelinquishExpiredVoteMarkerArgsV0

| Field        | Type |
| ------------ | ---- |
| free_task_id | u16  |
| trigger_ts   | i64  |

### RecentProposal

| Field    | Type   |
| -------- | ------ |
| proposal | pubkey |
| ts       | i64    |

### RemoveEntityFromCronArgsV0

| Field | Type |
| ----- | ---- |
| index | u32  |

### RunTaskReturnV0

| Field    | Type            |
| -------- | --------------- |
| tasks    | [object Object] |
| accounts | pubkey          |

### StartDelegationClaimBotArgsV0

| Field   | Type |
| ------- | ---- |
| task_id | u16  |

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

### UpdateEpochTrackerArgs

| Field     | Type   |
| --------- | ------ |
| epoch     | u64    |
| authority | pubkey |

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
