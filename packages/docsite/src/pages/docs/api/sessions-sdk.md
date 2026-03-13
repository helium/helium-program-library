# Sessions SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### close_session_v0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| session        | immut      | no     |      |
| rent_refund    | immut      | no     |      |
| system_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_session_manager_v0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| payer                | immut      | no     |      |
| authority            | immut      | no     |      |
| session_manager      | immut      | no     |      |
| task_queue           | immut      | no     |      |
| task_queue_authority | immut      | no     |      |
| queue_authority      | immut      | no     |      |
| system_program       | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_session_v0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| payer                | immut      | no     |      |
| wallet               | immut      | no     |      |
| temporary_authority  | immut      | no     |      |
| rent_refund          | immut      | no     |      |
| session              | immut      | no     |      |
| session_manager      | immut      | no     |      |
| task_queue           | immut      | no     |      |
| task_queue_authority | immut      | no     |      |
| queue_authority      | immut      | no     |      |
| task                 | immut      | no     |      |
| tuktuk_program       | immut      | no     |      |
| system_program       | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### SessionManagerV0

undefined

### SessionV0

undefined

### TaskQueueAuthorityV0

undefined

### TaskQueueV0

undefined

## Types

### InitializeSessionArgsV0

| Field              | Type   |
| ------------------ | ------ |
| expiration_seconds | u64    |
| application        | string |
| permissions        | string |
| task_id            | u16    |

### InitializeSessionManagerArgsV0

| Field                     | Type |
| ------------------------- | ---- |
| max_session_expiration_ts | u64  |

### SessionManagerV0

| Field                     | Type   |
| ------------------------- | ------ |
| authority                 | pubkey |
| task_queue                | pubkey |
| max_session_expiration_ts | u64    |
| bump_seed                 | u8     |

### SessionV0

| Field               | Type   |
| ------------------- | ------ |
| wallet              | pubkey |
| temporary_authority | pubkey |
| expiration_ts       | u64    |
| bump_seed           | u8     |
| rent_refund         | pubkey |
| application         | string |
| permissions         | string |

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
