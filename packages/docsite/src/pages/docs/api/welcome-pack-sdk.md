# Welcome Pack SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### claim_welcome_pack_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| claimer                  | immut      | no     |      |
| rent_refund              | immut      | no     |      |
| asset_return_address     | immut      | no     |      |
| owner                    | immut      | no     |      |
| welcome_pack             | immut      | no     |      |
| rewards_mint             | immut      | no     |      |
| recipient                | immut      | no     |      |
| rewards_recipient        | immut      | no     |      |
| token_account            | immut      | no     |      |
| queue_authority          | immut      | no     |      |
| task_queue               | immut      | no     |      |
| task_queue_authority     | immut      | no     |      |
| task                     | immut      | no     |      |
| pre_task                 | immut      | no     |      |
| tree_authority           | immut      | no     |      |
| merkle_tree              | immut      | no     |      |
| log_wrapper              | immut      | no     |      |
| compression_program      | immut      | no     |      |
| system_program           | immut      | no     |      |
| mini_fanout_program      | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| token_program            | immut      | no     |      |
| bubblegum_program        | immut      | no     |      |
| tuktuk_program           | immut      | no     |      |
| lazy_distributor_program | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### close_welcome_pack_v0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| owner               | immut      | no     |      |
| welcome_pack        | immut      | no     |      |
| user_welcome_packs  | immut      | no     |      |
| rent_refund         | immut      | no     |      |
| merkle_tree         | immut      | no     |      |
| tree_authority      | immut      | no     |      |
| log_wrapper         | immut      | no     |      |
| compression_program | immut      | no     |      |
| system_program      | immut      | no     |      |
| bubblegum_program   | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### initialize_welcome_pack_v0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| owner                | immut      | no     |      |
| payer                | immut      | no     |      |
| rent_refund          | immut      | no     |      |
| lazy_distributor     | immut      | no     |      |
| recipient            | immut      | no     |      |
| asset_return_address | immut      | no     |      |
| user_welcome_packs   | immut      | no     |      |
| welcome_pack         | immut      | no     |      |
| tree_authority       | immut      | no     |      |
| leaf_owner           | immut      | no     |      |
| merkle_tree          | immut      | no     |      |
| log_wrapper          | immut      | no     |      |
| compression_program  | immut      | no     |      |
| system_program       | immut      | no     |      |
| bubblegum_program    | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### LazyDistributorV0

undefined

### RecipientV0

undefined

### UserWelcomePacksV0

undefined

### WelcomePackV0

undefined

## Types

### ClaimWelcomePackArgsV0

| Field                         | Type            |
| ----------------------------- | --------------- |
| data_hash                     | [object Object] |
| creator_hash                  | [object Object] |
| root                          | [object Object] |
| index                         | u32             |
| approval_expiration_timestamp | i64             |
| claim_signature               | [object Object] |
| task_id                       | u16             |
| pre_task_id                   | u16             |

### CloseWelcomePackArgsV0

| Field        | Type            |
| ------------ | --------------- |
| data_hash    | [object Object] |
| creator_hash | [object Object] |
| root         | [object Object] |
| index        | u32             |

### InitializeWelcomePackArgsV0

| Field            | Type            |
| ---------------- | --------------- |
| sol_amount       | u64             |
| rewards_split    | [object Object] |
| rewards_schedule | string          |
| data_hash        | [object Object] |
| creator_hash     | [object Object] |
| root             | [object Object] |
| index            | u32             |

### LazyDistributorV0

| Field          | Type            |
| -------------- | --------------- |
| version        | u16             |
| rewards_mint   | pubkey          |
| rewards_escrow | pubkey          |
| authority      | pubkey          |
| oracles        | [object Object] |
| bump_seed      | u8              |
| approver       | pubkey          |

### MiniFanoutShareArgV0

| Field  | Type            |
| ------ | --------------- |
| wallet | pubkey          |
| share  | [object Object] |

### OracleConfigV0

| Field  | Type   |
| ------ | ------ |
| oracle | pubkey |
| url    | string |

### RecipientV0

| Field                  | Type            |
| ---------------------- | --------------- |
| lazy_distributor       | pubkey          |
| asset                  | pubkey          |
| total_rewards          | u64             |
| current_config_version | u16             |
| current_rewards        | [object Object] |
| bump_seed              | u8              |
| reserved               | u64             |
| destination            | pubkey          |

### Share

| Variant | Fields      |
| ------- | ----------- |
| Share   | amount: u32 |
| Fixed   | amount: u64 |

### UserWelcomePacksV0

| Field          | Type   |
| -------------- | ------ |
| next_id        | u32    |
| owner          | pubkey |
| bump_seed      | u8     |
| next_unique_id | u32    |

### WelcomePackV0

| Field                | Type            |
| -------------------- | --------------- |
| id                   | u32             |
| owner                | pubkey          |
| asset                | pubkey          |
| lazy_distributor     | pubkey          |
| rewards_mint         | pubkey          |
| rent_refund          | pubkey          |
| sol_amount           | u64             |
| rewards_split        | [object Object] |
| rewards_schedule     | string          |
| asset_return_address | pubkey          |
| bump_seed            | u8              |
| unique_id            | u32             |
