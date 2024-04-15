# Fanout SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeFanoutV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| authority              | immut      | no     |      |
| fanout                 | mut        | no     |      |
| tokenAccount           | mut        | no     |      |
| fanoutMint             | immut      | no     |      |
| collection             | mut        | no     |      |
| collectionAccount      | mut        | no     |      |
| membershipMint         | immut      | no     |      |
| metadata               | mut        | no     |      |
| masterEdition          | mut        | no     |      |
| tokenProgram           | immut      | no     |      |
| tokenMetadataProgram   | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| rent                   | immut      | no     |      |

#### Args

| Name | Type                   | Docs |
| ---- | ---------------------- | ---- |
| args | InitializeFanoutArgsV0 |      |

### stakeV0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| payer                   | mut        | yes    |      |
| staker                  | immut      | yes    |      |
| recipient               | immut      | no     |      |
| fanout                  | mut        | no     |      |
| membershipMint          | immut      | no     |      |
| tokenAccount            | immut      | no     |      |
| membershipCollection    | immut      | no     |      |
| collectionMetadata      | mut        | no     |      |
| collectionMasterEdition | immut      | no     |      |
| fromAccount             | mut        | no     |      |
| stakeAccount            | mut        | no     |      |
| receiptAccount          | mut        | no     |      |
| voucher                 | mut        | no     |      |
| mint                    | mut        | no     |      |
| metadata                | mut        | no     |      |
| masterEdition           | mut        | no     |      |
| tokenProgram            | immut      | no     |      |
| associatedTokenProgram  | immut      | no     |      |
| systemProgram           | immut      | no     |      |
| tokenMetadataProgram    | immut      | no     |      |

#### Args

| Name | Type        | Docs |
| ---- | ----------- | ---- |
| args | StakeArgsV0 |      |

### unstakeV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| solDestination         | mut        | no     |      |
| voucher                | mut        | no     |      |
| mint                   | mut        | no     |      |
| fanout                 | mut        | no     |      |
| membershipMint         | immut      | no     |      |
| receiptAccount         | mut        | no     |      |
| voucherAuthority       | immut      | yes    |      |
| toAccount              | mut        | no     |      |
| stakeAccount           | mut        | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### distributeV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| fanout                 | mut        | no     |      |
| fanoutMint             | immut      | no     |      |
| tokenAccount           | mut        | no     |      |
| owner                  | immut      | no     |      |
| toAccount              | mut        | no     |      |
| voucher                | mut        | no     |      |
| mint                   | immut      | no     |      |
| receiptAccount         | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### FanoutV0

| Field                | Type      |
| -------------------- | --------- |
| authority            | publicKey |
| tokenAccount         | publicKey |
| fanoutMint           | publicKey |
| membershipMint       | publicKey |
| totalShares          | u64       |
| totalStakedShares    | u64       |
| membershipCollection | publicKey |
| totalInflow          | u64       |
| lastSnapshotAmount   | u64       |
| name                 | string    |
| bumpSeed             | u8        |

### FanoutVoucherV0

| Field            | Type      |
| ---------------- | --------- |
| fanout           | publicKey |
| mint             | publicKey |
| stakeAccount     | publicKey |
| shares           | u64       |
| totalInflow      | u64       |
| totalDistributed | u64       |
| totalDust        | u64       |
| bumpSeed         | u8        |

## Types

### InitializeFanoutArgsV0

| Field | Type   |
| ----- | ------ |
| name  | string |

### StakeArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |
