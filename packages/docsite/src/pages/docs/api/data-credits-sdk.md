# Data Credits SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeDataCreditsV0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| dataCredits           | mut        | no     |      |
| hntPriceOracle        | immut      | no     |      |
| hntMint               | immut      | no     |      |
| circuitBreaker        | mut        | no     |      |
| dcMint                | mut        | no     |      |
| mintAuthority         | immut      | yes    |      |
| freezeAuthority       | immut      | yes    |      |
| accountPayer          | mut        | no     |      |
| payer                 | mut        | yes    |      |
| circuitBreakerProgram | immut      | no     |      |
| tokenProgram          | immut      | no     |      |
| systemProgram         | immut      | no     |      |

#### Args

| Name | Type                        | Docs |
| ---- | --------------------------- | ---- |
| args | InitializeDataCreditsArgsV0 |      |

### mintDataCreditsV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| dataCredits            | immut      | no     |      |
| hntPriceOracle         | immut      | no     |      |
| burner                 | mut        | no     |      |
| recipientTokenAccount  | mut        | no     |      |
| recipient              | immut      | no     |      |
| owner                  | mut        | yes    |      |
| hntMint                | mut        | no     |      |
| dcMint                 | mut        | no     |      |
| circuitBreaker         | mut        | no     |      |
| circuitBreakerProgram  | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |

#### Args

| Name | Type                  | Docs |
| ---- | --------------------- | ---- |
| args | MintDataCreditsArgsV0 |      |

### issueDataCreditsV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| dataCredits            | immut      | no     |      |
| dcMint                 | mut        | no     |      |
| to                     | immut      | no     |      |
| from                   | mut        | yes    |      |
| fromAccount            | mut        | no     |      |
| toAccount              | mut        | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type                   | Docs |
| ---- | ---------------------- | ---- |
| args | IssueDataCreditsArgsV0 |      |

### genesisIssueDelegatedDataCreditsV0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| delegatedDataCredits  | mut        | no     |      |
| dataCredits           | immut      | no     |      |
| lazySigner            | mut        | yes    |      |
| dcMint                | mut        | no     |      |
| circuitBreaker        | mut        | no     |      |
| circuitBreakerProgram | immut      | no     |      |
| dao                   | immut      | no     |      |
| subDao                | immut      | no     |      |
| escrowAccount         | mut        | no     |      |
| tokenProgram          | immut      | no     |      |
| systemProgram         | immut      | no     |      |

#### Args

| Name | Type                                   | Docs |
| ---- | -------------------------------------- | ---- |
| args | GenesisIssueDelegatedDataCreditsArgsV0 |      |

### burnDelegatedDataCreditsV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| subDaoEpochInfo      | mut        | no     |      |
| subDao               | mut        | no     |      |
| dcBurnAuthority      | immut      | yes    |      |
| registrar            | immut      | no     |      |
| dao                  | immut      | no     |      |
| dcMint               | mut        | no     |      |
| accountPayer         | mut        | no     |      |
| dataCredits          | immut      | no     |      |
| delegatedDataCredits | immut      | no     |      |
| escrowAccount        | mut        | no     |      |
| tokenProgram         | immut      | no     |      |
| heliumSubDaosProgram | immut      | no     |      |
| systemProgram        | immut      | no     |      |

#### Args

| Name | Type                           | Docs |
| ---- | ------------------------------ | ---- |
| args | BurnDelegatedDataCreditsArgsV0 |      |

### burnWithoutTrackingV0

#### Accounts

| Name         | Mutability | Signer | Docs |
| ------------ | ---------- | ------ | ---- |
| burnAccounts | immut      | no     |      |

#### Args

| Name | Type                      | Docs |
| ---- | ------------------------- | ---- |
| args | BurnWithoutTrackingArgsV0 |      |

### delegateDataCreditsV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| delegatedDataCredits   | mut        | no     |      |
| dataCredits            | immut      | no     |      |
| dcMint                 | immut      | no     |      |
| dao                    | immut      | no     |      |
| subDao                 | immut      | no     |      |
| owner                  | immut      | yes    |      |
| fromAccount            | mut        | no     |      |
| escrowAccount          | mut        | no     |      |
| payer                  | mut        | yes    |      |
| associatedTokenProgram | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type                      | Docs |
| ---- | ------------------------- | ---- |
| args | DelegateDataCreditsArgsV0 |      |

### updateDataCreditsV0

#### Accounts

| Name        | Mutability | Signer | Docs |
| ----------- | ---------- | ------ | ---- |
| dataCredits | mut        | no     |      |
| dcMint      | immut      | no     |      |
| authority   | immut      | yes    |      |

#### Args

| Name | Type                    | Docs |
| ---- | ----------------------- | ---- |
| args | UpdateDataCreditsArgsV0 |      |

### changeDelegatedSubDaoV0

#### Accounts

| Name                            | Mutability | Signer | Docs |
| ------------------------------- | ---------- | ------ | ---- |
| payer                           | mut        | yes    |      |
| authority                       | immut      | yes    |      |
| delegatedDataCredits            | immut      | no     |      |
| destinationDelegatedDataCredits | mut        | no     |      |
| dataCredits                     | immut      | no     |      |
| dcMint                          | immut      | no     |      |
| dao                             | immut      | no     |      |
| subDao                          | immut      | no     |      |
| destinationSubDao               | immut      | no     |      |
| escrowAccount                   | mut        | no     |      |
| destinationEscrowAccount        | mut        | no     |      |
| associatedTokenProgram          | immut      | no     |      |
| tokenProgram                    | immut      | no     |      |
| systemProgram                   | immut      | no     |      |

#### Args

| Name | Type                        | Docs |
| ---- | --------------------------- | ---- |
| args | ChangeDelegatedSubDaoArgsV0 |      |

## Accounts

### DataCreditsV0

| Field            | Type      |
| ---------------- | --------- |
| dcMint           | publicKey |
| hntMint          | publicKey |
| authority        | publicKey |
| hntPriceOracle   | publicKey |
| dataCreditsBump  | u8        |
| accountPayer     | publicKey |
| accountPayerBump | u8        |

### DelegatedDataCreditsV0

| Field         | Type      |
| ------------- | --------- |
| dataCredits   | publicKey |
| subDao        | publicKey |
| escrowAccount | publicKey |
| routerKey     | string    |
| bump          | u8        |

## Types

### WindowedCircuitBreakerConfigV0

| Field             | Type          |
| ----------------- | ------------- |
| windowSizeSeconds | u64           |
| thresholdType     | ThresholdType |
| threshold         | u64           |

### BurnDelegatedDataCreditsArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### BurnWithoutTrackingArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### ChangeDelegatedSubDaoArgsV0

| Field     | Type   |
| --------- | ------ |
| amount    | u64    |
| routerKey | string |

### DelegateDataCreditsArgsV0

| Field     | Type   |
| --------- | ------ |
| amount    | u64    |
| routerKey | string |

### GenesisIssueDelegatedDataCreditsArgsV0

| Field     | Type   |
| --------- | ------ |
| amount    | u64    |
| routerKey | string |

### InitializeDataCreditsArgsV0

| Field     | Type                           |
| --------- | ------------------------------ |
| authority | publicKey                      |
| config    | WindowedCircuitBreakerConfigV0 |

### IssueDataCreditsArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### MintDataCreditsArgsV0

| Field     | Type |
| --------- | ---- |
| hntAmount | u64  |
| dcAmount  | u64  |

### UpdateDataCreditsArgsV0

| Field          | Type      |
| -------------- | --------- |
| newAuthority   | publicKey |
| hntPriceOracle | publicKey |

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |
