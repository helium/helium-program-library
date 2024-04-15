# Lazy Distributor SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeLazyDistributorV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| lazyDistributor        | mut        | no     |      |
| rewardsMint            | mut        | no     |      |
| rewardsEscrow          | mut        | no     |      |
| circuitBreaker         | mut        | no     |      |
| systemProgram          | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| circuitBreakerProgram  | immut      | no     |      |
| tokenProgram           | immut      | no     |      |

#### Args

| Name | Type                            | Docs |
| ---- | ------------------------------- | ---- |
| args | InitializeLazyDistributorArgsV0 |      |

### initializeRecipientV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| payer           | mut        | yes    |      |
| lazyDistributor | immut      | no     |      |
| recipient       | mut        | no     |      |
| mint            | immut      | no     |      |
| targetMetadata  | immut      | no     |      |
| systemProgram   | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initializeCompressionRecipientV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| payer              | mut        | yes    |      |
| lazyDistributor    | immut      | no     |      |
| recipient          | mut        | no     |      |
| merkleTree         | immut      | no     |      |
| owner              | immut      | no     |      |
| delegate           | immut      | no     |      |
| compressionProgram | immut      | no     |      |
| systemProgram      | immut      | no     |      |

#### Args

| Name | Type                                 | Docs |
| ---- | ------------------------------------ | ---- |
| args | InitializeCompressionRecipientArgsV0 |      |

### setCurrentRewardsV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| payer           | mut        | yes    |      |
| lazyDistributor | immut      | no     |      |
| recipient       | mut        | no     |      |
| oracle          | immut      | yes    |      |
| systemProgram   | immut      | no     |      |

#### Args

| Name | Type                    | Docs |
| ---- | ----------------------- | ---- |
| args | SetCurrentRewardsArgsV0 |      |

### distributeRewardsV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| common               | immut      | no     |      |
| recipientMintAccount | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### distributeCompressionRewardsV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| common             | immut      | no     |      |
| merkleTree         | immut      | no     |      |
| compressionProgram | immut      | no     |      |
| tokenProgram       | immut      | no     |      |

#### Args

| Name | Type                               | Docs |
| ---- | ---------------------------------- | ---- |
| args | DistributeCompressionRewardsArgsV0 |      |

### updateLazyDistributorV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| lazyDistributor | mut        | no     |      |
| rewardsMint     | immut      | no     |      |
| authority       | immut      | yes    |      |

#### Args

| Name | Type                        | Docs |
| ---- | --------------------------- | ---- |
| args | UpdateLazyDistributorArgsV0 |      |

## Accounts

### LazyDistributorV0

| Field         | Type           |
| ------------- | -------------- |
| version       | u16            |
| rewardsMint   | publicKey      |
| rewardsEscrow | publicKey      |
| authority     | publicKey      |
| oracles       | OracleConfigV0 |
| bumpSeed      | u8             |
| approver      | publicKey      |

### RecipientV0

| Field                | Type            |
| -------------------- | --------------- |
| lazyDistributor      | publicKey       |
| asset                | publicKey       |
| totalRewards         | u64             |
| currentConfigVersion | u16             |
| currentRewards       | [object Object] |
| bumpSeed             | u8              |

## Types

### WindowedCircuitBreakerConfigV0

| Field             | Type          |
| ----------------- | ------------- |
| windowSizeSeconds | u64           |
| thresholdType     | ThresholdType |
| threshold         | u64           |

### DistributeCompressionRewardsArgsV0

| Field       | Type            |
| ----------- | --------------- |
| dataHash    | [object Object] |
| creatorHash | [object Object] |
| root        | [object Object] |
| index       | u32             |

### InitializeCompressionRecipientArgsV0

| Field       | Type            |
| ----------- | --------------- |
| dataHash    | [object Object] |
| creatorHash | [object Object] |
| root        | [object Object] |
| index       | u32             |

### InitializeLazyDistributorArgsV0

| Field        | Type                           |
| ------------ | ------------------------------ |
| oracles      | OracleConfigV0                 |
| authority    | publicKey                      |
| windowConfig | WindowedCircuitBreakerConfigV0 |
| approver     | publicKey                      |

### SetCurrentRewardsArgsV0

| Field          | Type |
| -------------- | ---- |
| oracleIndex    | u16  |
| currentRewards | u64  |

### UpdateLazyDistributorArgsV0

| Field     | Type            |
| --------- | --------------- |
| oracles   | [object Object] |
| authority | publicKey       |
| approver  | [object Object] |

### OracleConfigV0

| Field  | Type      |
| ------ | --------- |
| oracle | publicKey |
| url    | string    |

### Creator

| Field    | Type      |
| -------- | --------- |
| address  | publicKey |
| verified | bool      |
| share    | u8        |

### Uses

| Field     | Type      |
| --------- | --------- |
| useMethod | UseMethod |
| remaining | u64       |
| total     | u64       |

### Collection

| Field    | Type      |
| -------- | --------- |
| verified | bool      |
| key      | publicKey |

### MetadataArgs

| Field                | Type                |
| -------------------- | ------------------- |
| name                 | string              |
| symbol               | string              |
| uri                  | string              |
| sellerFeeBasisPoints | u16                 |
| primarySaleHappened  | bool                |
| isMutable            | bool                |
| editionNonce         | u8                  |
| tokenStandard        | [object Object]     |
| collection           | [object Object]     |
| uses                 | [object Object]     |
| tokenProgramVersion  | TokenProgramVersion |
| creators             | Creator             |

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### TokenProgramVersion

| Variant   | Fields |
| --------- | ------ |
| Original  |        |
| Token2022 |        |

### TokenStandard

| Variant            | Fields |
| ------------------ | ------ |
| NonFungible        |        |
| FungibleAsset      |        |
| Fungible           |        |
| NonFungibleEdition |        |

### UseMethod

| Variant  | Fields |
| -------- | ------ |
| Burn     |        |
| Multiple |        |
| Single   |        |
