# Treasury Management SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeTreasuryManagementV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| treasuryManagement     | mut        | no     |      |
| treasuryMint           | immut      | no     |      |
| supplyMint             | immut      | no     |      |
| mintAuthority          | immut      | yes    |      |
| circuitBreaker         | mut        | no     |      |
| treasury               | mut        | no     |      |
| systemProgram          | immut      | no     |      |
| circuitBreakerProgram  | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| tokenProgram           | immut      | no     |      |

#### Args

| Name | Type                               | Docs |
| ---- | ---------------------------------- | ---- |
| args | InitializeTreasuryManagementArgsV0 |      |

### updateTreasuryManagementV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| treasuryManagement | mut        | no     |      |
| authority          | immut      | yes    |      |

#### Args

| Name | Type                           | Docs |
| ---- | ------------------------------ | ---- |
| args | UpdateTreasuryManagementArgsV0 |      |

### redeemV0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| treasuryManagement    | immut      | no     |      |
| treasuryMint          | immut      | no     |      |
| supplyMint            | mut        | no     |      |
| treasury              | mut        | no     |      |
| circuitBreaker        | mut        | no     |      |
| from                  | mut        | no     |      |
| to                    | mut        | no     |      |
| owner                 | immut      | yes    |      |
| circuitBreakerProgram | immut      | no     |      |
| tokenProgram          | immut      | no     |      |

#### Args

| Name | Type         | Docs |
| ---- | ------------ | ---- |
| args | RedeemArgsV0 |      |

## Accounts

### TreasuryManagementV0

| Field          | Type      |
| -------------- | --------- |
| treasuryMint   | publicKey |
| supplyMint     | publicKey |
| authority      | publicKey |
| treasury       | publicKey |
| curve          | Curve     |
| freezeUnixTime | i64       |
| bumpSeed       | u8        |

## Types

### WindowedCircuitBreakerConfigV0

| Field             | Type          |
| ----------------- | ------------- |
| windowSizeSeconds | u64           |
| thresholdType     | ThresholdType |
| threshold         | u64           |

### InitializeTreasuryManagementArgsV0

| Field          | Type                           |
| -------------- | ------------------------------ |
| authority      | publicKey                      |
| curve          | Curve                          |
| freezeUnixTime | i64                            |
| windowConfig   | WindowedCircuitBreakerConfigV0 |

### RedeemArgsV0

| Field                | Type |
| -------------------- | ---- |
| amount               | u64  |
| expectedOutputAmount | u64  |

### UpdateTreasuryManagementArgsV0

| Field          | Type      |
| -------------- | --------- |
| authority      | publicKey |
| curve          | Curve     |
| freezeUnixTime | i64       |

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### Curve

| Variant            | Fields  |
| ------------------ | ------- |
| ExponentialCurveV0 | k: u128 |
