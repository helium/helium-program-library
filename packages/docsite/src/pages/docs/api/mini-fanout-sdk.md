# Mini Fanout SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### close_mini_fanout_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| owner                    | immut      | no     |      |
| mini_fanout              | immut      | no     |      |
| mint                     | immut      | no     |      |
| queue_authority          | immut      | no     |      |
| task_queue_authority     | immut      | no     |      |
| rent_refund              | immut      | no     |      |
| task_queue               | immut      | no     |      |
| next_task                | immut      | no     |      |
| token_account            | immut      | no     |      |
| owner_token_account      | immut      | no     |      |
| next_pre_task            | immut      | no     |      |
| task_rent_refund         | immut      | no     |      |
| tuktuk_program           | immut      | no     |      |
| system_program           | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### distribute_v0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| mini_fanout   | immut      | no     |      |
| task_queue    | immut      | no     |      |
| next_task     | immut      | no     |      |
| next_pre_task | immut      | no     |      |
| token_account | immut      | no     |      |
| token_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_mini_fanout_v0

#### Accounts

| Name                     | Mutability | Signer | Docs                        |
| ------------------------ | ---------- | ------ | --------------------------- |
| payer                    | immut      | no     |                             |
| owner                    | immut      | no     |                             |
| namespace                | immut      | no     | The namespace for the seeds |
| mini_fanout              | immut      | no     |                             |
| task_queue               | immut      | no     |                             |
| rent_refund              | immut      | no     |                             |
| mint                     | immut      | no     |                             |
| token_account            | immut      | no     |                             |
| queue_authority          | immut      | no     |                             |
| system_program           | immut      | no     |                             |
| associated_token_program | immut      | no     |                             |
| token_program            | immut      | no     |                             |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### schedule_task_v0

#### Accounts

| Name                 | Mutability | Signer | Docs                                          |
| -------------------- | ---------- | ------ | --------------------------------------------- |
| payer                | immut      | no     |                                               |
| mini_fanout          | immut      | no     |                                               |
| next_task            | immut      | no     | Only allow one task to be scheduled at a time |
| next_pre_task        | immut      | no     | Only allow one task to be scheduled at a time |
| queue_authority      | immut      | no     |                                               |
| task_queue_authority | immut      | no     |                                               |
| task_queue           | immut      | no     |                                               |
| task                 | immut      | no     |                                               |
| pre_task             | immut      | no     |                                               |
| tuktuk_program       | immut      | no     |                                               |
| system_program       | immut      | no     |                                               |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_mini_fanout_v0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| owner                | immut      | no     |      |
| payer                | immut      | no     |      |
| mini_fanout          | immut      | no     |      |
| queue_authority      | immut      | no     |      |
| task_queue_authority | immut      | no     |      |
| task_queue           | immut      | no     |      |
| next_task            | immut      | no     |      |
| next_pre_task        | immut      | no     |      |
| new_task             | immut      | no     |      |
| new_pre_task         | immut      | no     |      |
| task_rent_refund     | immut      | no     |      |
| tuktuk_program       | immut      | no     |      |
| system_program       | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### update_wallet_delegate_v0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| payer                | immut      | no     |      |
| wallet               | immut      | no     |      |
| mini_fanout          | immut      | no     |      |
| queue_authority      | immut      | no     |      |
| task_queue_authority | immut      | no     |      |
| task_queue           | immut      | no     |      |
| next_task            | immut      | no     |      |
| new_task             | immut      | no     |      |
| next_pre_task        | immut      | no     |      |
| new_pre_task         | immut      | no     |      |
| tuktuk_program       | immut      | no     |      |
| system_program       | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### MiniFanoutV0

undefined

### TaskQueueAuthorityV0

undefined

### TaskQueueV0

undefined

### TaskV0

undefined

## Types

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

### InitializeMiniFanoutArgsV0

| Field    | Type            |
| -------- | --------------- |
| schedule | string          |
| shares   | [object Object] |
| seed     | bytes           |
| pre_task | [object Object] |

### MiniFanoutShareArgV0

| Field  | Type            |
| ------ | --------------- |
| wallet | pubkey          |
| share  | [object Object] |

### MiniFanoutShareV0

| Field      | Type            |
| ---------- | --------------- |
| wallet     | pubkey          |
| delegate   | pubkey          |
| share      | [object Object] |
| total_dust | u64             |
| total_owed | u64             |

### MiniFanoutV0

| Field                | Type            |
| -------------------- | --------------- |
| owner                | pubkey          |
| namespace            | pubkey          |
| mint                 | pubkey          |
| token_account        | pubkey          |
| task_queue           | pubkey          |
| next_task            | pubkey          |
| rent_refund          | pubkey          |
| bump                 | u8              |
| schedule             | string          |
| queue_authority_bump | u8              |
| shares               | [object Object] |
| seed                 | bytes           |
| next_pre_task        | pubkey          |
| pre_task             | [object Object] |

### RunTaskReturnV0

| Field    | Type            |
| -------- | --------------- |
| tasks    | [object Object] |
| accounts | pubkey          |

### ScheduleTaskArgsV0

| Field       | Type |
| ----------- | ---- |
| task_id     | u16  |
| pre_task_id | u16  |

### Share

| Variant | Fields      |
| ------- | ----------- |
| Share   | amount: u32 |
| Fixed   | amount: u64 |

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

### TaskV0

| Field        | Type            |
| ------------ | --------------- |
| task_queue   | pubkey          |
| rent_amount  | u64             |
| crank_reward | u64             |
| id           | u16             |
| trigger      | [object Object] |
| rent_refund  | pubkey          |
| transaction  | [object Object] |
| queued_at    | i64             |
| bump_seed    | u8              |
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

### UpdateMiniFanoutArgsV0

| Field           | Type            |
| --------------- | --------------- |
| new_task_id     | u16             |
| new_pre_task_id | u16             |
| shares          | [object Object] |
| schedule        | string          |

### UpdateWalletDelegateArgsV0

| Field           | Type   |
| --------------- | ------ |
| index           | u8     |
| new_task_id     | u16    |
| new_pre_task_id | u16    |
| delegate        | pubkey |
