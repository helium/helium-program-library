# Rewards Oracle SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### setCurrentRewardsWrapperV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| oracle                 | mut        | yes    |      |
| lazyDistributor        | immut      | no     |      |
| recipient              | mut        | no     |      |
| keyToAsset             | immut      | no     |      |
| oracleSigner           | immut      | no     |      |
| lazyDistributorProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type                           | Docs |
| ---- | ------------------------------ | ---- |
| args | SetCurrentRewardsWrapperArgsV0 |      |

### setCurrentRewardsWrapperV1

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| oracle                 | mut        | yes    |      |
| lazyDistributor        | immut      | no     |      |
| recipient              | mut        | no     |      |
| keyToAsset             | immut      | no     |      |
| oracleSigner           | immut      | no     |      |
| lazyDistributorProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type                           | Docs |
| ---- | ------------------------------ | ---- |
| args | SetCurrentRewardsWrapperArgsV1 |      |

## Accounts

## Types

### SetCurrentRewardsWrapperArgsV0

| Field          | Type  |
| -------------- | ----- |
| entityKey      | bytes |
| oracleIndex    | u16   |
| currentRewards | u64   |

### SetCurrentRewardsWrapperArgsV1

| Field          | Type |
| -------------- | ---- |
| oracleIndex    | u16  |
| currentRewards | u64  |
