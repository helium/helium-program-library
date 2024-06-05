# Hexboosting SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### boostV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| boostConfig            | immut      | no     |      |
| carrier                | immut      | no     |      |
| hexboostAuthority      | immut      | yes    |      |
| priceOracle            | immut      | no     |      |
| paymentMint            | mut        | no     |      |
| paymentAccount         | mut        | no     |      |
| boostedHex             | mut        | no     |      |
| systemProgram          | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |

#### Args

| Name | Type        | Docs |
| ---- | ----------- | ---- |
| args | BoostArgsV0 |      |

### initializeBoostConfigV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| payer                | mut        | yes    |      |
| subDao               | immut      | no     |      |
| authority            | immut      | yes    |      |
| rentReclaimAuthority | immut      | no     |      |
| startAuthority       | immut      | no     |      |
| priceOracle          | immut      | no     |      |
| dntMint              | immut      | no     |      |
| boostConfig          | mut        | no     |      |
| systemProgram        | immut      | no     |      |

#### Args

| Name | Type                        | Docs |
| ---- | --------------------------- | ---- |
| args | InitializeBoostConfigArgsV0 |      |

### startBoostV0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| startAuthority | immut      | yes    |      |
| boostConfig    | immut      | no     |      |
| boostedHex     | mut        | no     |      |

#### Args

| Name | Type             | Docs |
| ---- | ---------------- | ---- |
| args | StartBoostArgsV0 |      |

### closeBoostV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| rentReclaimAuthority | immut      | yes    |      |
| boostConfig          | immut      | no     |      |
| boostedHex           | mut        | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### updateBoostConfigV0

#### Accounts

| Name        | Mutability | Signer | Docs |
| ----------- | ---------- | ------ | ---- |
| subDao      | immut      | no     |      |
| authority   | immut      | yes    |      |
| boostConfig | mut        | no     |      |

#### Args

| Name | Type                    | Docs |
| ---- | ----------------------- | ---- |
| args | UpdateBoostConfigArgsV0 |      |

## Accounts

### BoostConfigV0

| Field                | Type      |
| -------------------- | --------- |
| priceOracle          | publicKey |
| paymentMint          | publicKey |
| subDao               | publicKey |
| rentReclaimAuthority | publicKey |
| boostPrice           | u64       |
| periodLength         | u32       |
| minimumPeriods       | u16       |
| bumpSeed             | u8        |
| startAuthority       | publicKey |

### BoostedHexV0

| Field          | Type            |
| -------------- | --------------- |
| boostConfig    | publicKey       |
| location       | u64             |
| startTs        | i64             |
| reserved       | [object Object] |
| bumpSeed       | u8              |
| boostsByPeriod | bytes           |
| version        | u32             |

### BoostedHexV1

| Field          | Type         |
| -------------- | ------------ |
| deviceType     | DeviceTypeV0 |
| boostConfig    | publicKey    |
| version        | u32          |
| location       | u64          |
| startTs        | i64          |
| bumpSeed       | u8           |
| boostsByPeriod | bytes        |

## Types

### BoostArgsV0

| Field      | Type          |
| ---------- | ------------- |
| location   | u64           |
| version    | u32           |
| amounts    | BoostAmountV0 |
| deviceType | DeviceTypeV0  |

### BoostAmountV0

| Field  | Type |
| ------ | ---- |
| period | u16  |
| amount | u8   |

### InitializeBoostConfigArgsV0

| Field          | Type |
| -------------- | ---- |
| boostPrice     | u64  |
| periodLength   | u32  |
| minimumPeriods | u16  |

### StartBoostArgsV0

| Field   | Type |
| ------- | ---- |
| startTs | i64  |

### UpdateBoostConfigArgsV0

| Field                | Type      |
| -------------------- | --------- |
| startAuthority       | publicKey |
| rentReclaimAuthority | publicKey |
| boostPrice           | u64       |
| minimumPeriods       | u16       |
| priceOracle          | publicKey |

### DeviceTypeV0

| Variant     | Fields |
| ----------- | ------ |
| CbrsIndoor  |        |
| CbrsOutdoor |        |
| WifiIndoor  |        |
| WifiOutdoor |        |
