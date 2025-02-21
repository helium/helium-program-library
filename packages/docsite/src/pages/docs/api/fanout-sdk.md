# Fanout SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### distribute_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| fanout                   | immut      | no     |      |
| fanout_mint              | immut      | no     |      |
| token_account            | immut      | no     |      |
| owner                    | immut      | no     |      |
| to_account               | immut      | no     |      |
| voucher                  | immut      | no     |      |
| mint                     | immut      | no     |      |
| receipt_account          | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initialize_fanout_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| authority                | immut      | no     |      |
| fanout                   | immut      | no     |      |
| token_account            | immut      | no     |      |
| fanout_mint              | immut      | no     |      |
| collection               | immut      | no     |      |
| collection_account       | immut      | no     |      |
| membership_mint          | immut      | no     |      |
| metadata                 | immut      | no     |      |
| master_edition           | immut      | no     |      |
| token_program            | immut      | no     |      |
| token_metadata_program   | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |
| rent                     | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### stake_v0

#### Accounts

| Name                      | Mutability | Signer | Docs |
| ------------------------- | ---------- | ------ | ---- |
| payer                     | immut      | no     |      |
| staker                    | immut      | no     |      |
| recipient                 | immut      | no     |      |
| fanout                    | immut      | no     |      |
| membership_mint           | immut      | no     |      |
| token_account             | immut      | no     |      |
| membership_collection     | immut      | no     |      |
| collection_metadata       | immut      | no     |      |
| collection_master_edition | immut      | no     |      |
| from_account              | immut      | no     |      |
| stake_account             | immut      | no     |      |
| receipt_account           | immut      | no     |      |
| voucher                   | immut      | no     |      |
| mint                      | immut      | no     |      |
| metadata                  | immut      | no     |      |
| master_edition            | immut      | no     |      |
| token_program             | immut      | no     |      |
| associated_token_program  | immut      | no     |      |
| system_program            | immut      | no     |      |
| token_metadata_program    | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### unstake_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| payer                    | immut      | no     |      |
| sol_destination          | immut      | no     |      |
| voucher                  | immut      | no     |      |
| mint                     | immut      | no     |      |
| fanout                   | immut      | no     |      |
| membership_mint          | immut      | no     |      |
| receipt_account          | immut      | no     |      |
| voucher_authority        | immut      | no     |      |
| to_account               | immut      | no     |      |
| stake_account            | immut      | no     |      |
| token_program            | immut      | no     |      |
| associated_token_program | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### FanoutV0

undefined

### FanoutVoucherV0

undefined

## Types

### FanoutV0

| Field                 | Type   |
| --------------------- | ------ |
| authority             | pubkey |
| token_account         | pubkey |
| fanout_mint           | pubkey |
| membership_mint       | pubkey |
| total_shares          | u64    |
| total_staked_shares   | u64    |
| membership_collection | pubkey |
| total_inflow          | u64    |
| last_snapshot_amount  | u64    |
| name                  | string |
| bump_seed             | u8     |

### FanoutVoucherV0

| Field             | Type   |
| ----------------- | ------ |
| fanout            | pubkey |
| mint              | pubkey |
| stake_account     | pubkey |
| shares            | u64    |
| total_inflow      | u64    |
| total_distributed | u64    |
| total_dust        | u64    |
| bump_seed         | u8     |

### InitializeFanoutArgsV0

| Field | Type   |
| ----- | ------ |
| name  | string |

### StakeArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |
