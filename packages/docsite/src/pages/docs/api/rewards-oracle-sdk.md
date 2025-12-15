# Rewards Oracle SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### set_current_rewards_wrapper_v0

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| oracle                   | immut      | no     |      |
| lazy_distributor         | immut      | no     |      |
| recipient                | immut      | no     |      |
| key_to_asset             | immut      | no     |      |
| oracle_signer            | immut      | no     |      |
| lazy_distributor_program | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### set_current_rewards_wrapper_v1

#### Accounts

| Name                     | Mutability | Signer | Docs |
| ------------------------ | ---------- | ------ | ---- |
| oracle                   | immut      | no     |      |
| lazy_distributor         | immut      | no     |      |
| recipient                | immut      | no     |      |
| key_to_asset             | immut      | no     |      |
| oracle_signer            | immut      | no     |      |
| lazy_distributor_program | immut      | no     |      |
| system_program           | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### set_current_rewards_wrapper_v2

#### Accounts

| Name                     | Mutability | Signer | Docs                                                                                                                                                   |
| ------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| payer                    | immut      | no     |                                                                                                                                                        |
| lazy_distributor         | immut      | no     |                                                                                                                                                        |
| recipient                | immut      | no     |                                                                                                                                                        |
| key_to_asset             | immut      | no     |                                                                                                                                                        |
| oracle_signer            | immut      | no     |                                                                                                                                                        |
| lazy_distributor_program | immut      | no     |                                                                                                                                                        |
| system_program           | immut      | no     |                                                                                                                                                        |
| sysvar_instructions      | immut      | no     | the supplied Sysvar could be anything else. The Instruction Sysvar has not been implemented in the Anchor framework yet, so this is the safe approach. |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

### temp_close_recipient_wrapper_v0

#### Accounts

| Name                     | Mutability | Signer | Docs                                                              |
| ------------------------ | ---------- | ------ | ----------------------------------------------------------------- |
| authority                | immut      | no     |                                                                   |
| approver                 | immut      | no     | Optional approver - must sign if lazy_distributor.approver is set |
| lazy_distributor         | immut      | no     |                                                                   |
| recipient                | immut      | no     |                                                                   |
| key_to_asset             | immut      | no     |                                                                   |
| dao                      | immut      | no     |                                                                   |
| oracle_signer            | immut      | no     |                                                                   |
| lazy_distributor_program | immut      | no     |                                                                   |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | [object Object] |      |

## Accounts

### KeyToAssetV0

undefined

### LazyDistributorV0

undefined

### RecipientV0

undefined

## Types

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

### SetCurrentRewardsWrapperArgsV0

| Field           | Type  |
| --------------- | ----- |
| entity_key      | bytes |
| oracle_index    | u16   |
| current_rewards | u64   |

### SetCurrentRewardsWrapperArgsV1

| Field           | Type |
| --------------- | ---- |
| oracle_index    | u16  |
| current_rewards | u64  |

### TempCloseRecipientWrapperArgsV0

| Field      | Type   |
| ---------- | ------ |
| entity_key | bytes  |
| asset      | pubkey |
