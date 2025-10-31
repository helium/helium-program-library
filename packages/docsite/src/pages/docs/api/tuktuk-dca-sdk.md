# Tuktuk Dca SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### check_repay_v0

#### Accounts

| Name                      | Mutability | Signer | Docs |
| ------------------------- | ---------- | ------ | ---- |
| dca                       | immut      | no     |      |
| next_task                 | immut      | no     |      |
| input_account             | immut      | no     |      |
| rent_refund               | immut      | no     |      |
| destination_token_account | immut      | no     |      |
| input_price_oracle        | immut      | no     |      |
| output_price_oracle       | immut      | no     |      |
| token_program             | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### close_dca_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| authority                | immut      | no     |      |
| dca                      | immut      | no     |      |
| input_mint               | immut      | no     |      |
| input_account            | immut      | no     |      |
| authority_input_account  | immut      | no     |      |
| queue_authority          | immut      | no     |      |
| task_queue_authority     | immut      | no     |      |
| rent_refund              | immut      | no     |      |
| task_queue               | immut      | no     |      |
| next_task                | immut      | no     |      |
| tuktuk_program           | immut      | no     |      |
| token_program            | immut      | no     |      |
| system_program           | immut      | no     |      |
| associated_token_program | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_dca_nested_v0

#### Accounts

| Name | Mutability | Signer | Docs |
| ---- | ---------- | ------ | ---- |
| core | immut      | no     |      |
| task | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_dca_v0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| core                 | immut      | no     |      |
| queue_authority      | immut      | no     |      |
| task                 | immut      | no     |      |
| task_queue_authority | immut      | no     |      |
| tuktuk_program       | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### lend_v0

#### Accounts

| Name                      | Mutability | Signer | Docs                                        |
| ------------------------- | ---------- | ------ | ------------------------------------------- |
| dca                       | immut      | no     |                                             |
| input_account             | immut      | no     |                                             |
| destination_token_account | immut      | no     |                                             |
| lend_destination          | immut      | no     |                                             |
| next_task                 | immut      | no     |                                             |
| token_program             | immut      | no     |                                             |
| instruction_sysvar        | immut      | no     | the supplied Sysvar could be anything else. |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### DcaV0

undefined

### PriceUpdateV2

undefined

### TaskQueueAuthorityV0

undefined

### TaskV0

undefined

## Types

### CheckRepayArgsV0

| Field | Type |
| ----- | ---- |

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

### DcaV0

| Field                        | Type            |
| ---------------------------- | --------------- |
| authority                    | pubkey          |
| input_price_oracle           | pubkey          |
| output_price_oracle          | pubkey          |
| input_mint                   | pubkey          |
| output_mint                  | pubkey          |
| input_account                | pubkey          |
| destination_wallet           | pubkey          |
| destination_token_account    | pubkey          |
| pre_swap_destination_balance | u64             |
| swap_input_amount            | u64             |
| swap_amount_per_order        | u64             |
| interval_seconds             | u64             |
| next_task                    | pubkey          |
| task_queue                   | pubkey          |
| queued_at                    | i64             |
| index                        | u16             |
| slippage_bps_from_oracle     | u16             |
| initial_num_orders           | u32             |
| num_orders                   | u32             |
| bump                         | u8              |
| is_swapping                  | u8              |
| reserved                     | [object Object] |
| dca_signer                   | pubkey          |
| dca_url                      | [object Object] |
| rent_refund                  | pubkey          |
| crank_reward                 | u64             |

### InitializeDcaArgsV0

| Field                    | Type   |
| ------------------------ | ------ |
| index                    | u16    |
| num_orders               | u32    |
| swap_amount_per_order    | u64    |
| interval_seconds         | u64    |
| slippage_bps_from_oracle | u16    |
| task_id                  | u16    |
| dca_signer               | pubkey |
| dca_url                  | string |
| crank_reward             | u64    |

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

### RunTaskReturnV0

| Field    | Type            |
| -------- | --------------- |
| tasks    | [object Object] |
| accounts | pubkey          |

### TaskQueueAuthorityV0

| Field           | Type   |
| --------------- | ------ |
| task_queue      | pubkey |
| queue_authority | pubkey |
| bump_seed       | u8     |

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

### VerificationLevel

| Variant | Fields             |
| ------- | ------------------ |
| Partial | num_signatures: u8 |
| Full    |                    |
