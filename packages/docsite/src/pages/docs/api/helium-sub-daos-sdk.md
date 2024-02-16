# Helium Sub Daos SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeDaoV0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| payer                 | mut        | yes    |      |
| dao                   | mut        | no     |      |
| hntMint               | mut        | no     |      |
| hntMintAuthority      | immut      | yes    |      |
| hntFreezeAuthority    | immut      | yes    |      |
| hntCircuitBreaker     | mut        | no     |      |
| dcMint                | immut      | no     |      |
| hstPool               | immut      | no     |      |
| systemProgram         | immut      | no     |      |
| tokenProgram          | immut      | no     |      |
| circuitBreakerProgram | immut      | no     |      |

#### Args

| Name | Type                | Docs |
| ---- | ------------------- | ---- |
| args | InitializeDaoArgsV0 |      |

### initializeSubDaoV0

#### Accounts

| Name                        | Mutability | Signer | Docs |
| --------------------------- | ---------- | ------ | ---- |
| payer                       | mut        | yes    |      |
| dao                         | mut        | no     |      |
| authority                   | immut      | yes    |      |
| subDao                      | mut        | no     |      |
| hntMint                     | immut      | no     |      |
| dntMint                     | mut        | no     |      |
| dntMintAuthority            | immut      | yes    |      |
| subDaoFreezeAuthority       | immut      | yes    |      |
| circuitBreaker              | mut        | no     |      |
| treasury                    | mut        | no     |      |
| treasuryCircuitBreaker      | mut        | no     |      |
| treasuryManagement          | mut        | no     |      |
| rewardsEscrow               | immut      | no     |      |
| delegatorPoolCircuitBreaker | mut        | no     |      |
| delegatorPool               | mut        | no     |      |
| systemProgram               | immut      | no     |      |
| tokenProgram                | immut      | no     |      |
| treasuryManagementProgram   | immut      | no     |      |
| circuitBreakerProgram       | immut      | no     |      |
| associatedTokenProgram      | immut      | no     |      |

#### Args

| Name | Type                   | Docs |
| ---- | ---------------------- | ---- |
| args | InitializeSubDaoArgsV0 |      |

### updateDaoV0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| payer         | mut        | yes    |      |
| dao           | mut        | no     |      |
| authority     | immut      | yes    |      |
| systemProgram | immut      | no     |      |

#### Args

| Name | Type            | Docs |
| ---- | --------------- | ---- |
| args | UpdateDaoArgsV0 |      |

### updateSubDaoV0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| payer         | mut        | yes    |      |
| subDao        | mut        | no     |      |
| authority     | immut      | yes    |      |
| systemProgram | immut      | no     |      |

#### Args

| Name | Type               | Docs |
| ---- | ------------------ | ---- |
| args | UpdateSubDaoArgsV0 |      |

### updateSubDaoVehntV0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| subDao        | mut        | no     |      |
| authority     | immut      | yes    |      |
| systemProgram | immut      | no     |      |

#### Args

| Name | Type                    | Docs |
| ---- | ----------------------- | ---- |
| args | UpdateSubDaoVeHntArgsV0 |      |

### trackDcBurnV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| subDaoEpochInfo | mut        | no     |      |
| subDao          | mut        | no     |      |
| registrar       | immut      | no     |      |
| dao             | immut      | no     |      |
| dcMint          | immut      | no     |      |
| accountPayer    | mut        | yes    |      |
| systemProgram   | immut      | no     |      |

#### Args

| Name | Type              | Docs |
| ---- | ----------------- | ---- |
| args | TrackDcBurnArgsV0 |      |

### calculateUtilityScoreV0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| payer                 | mut        | yes    |      |
| registrar             | immut      | no     |      |
| dao                   | immut      | no     |      |
| hntMint               | immut      | no     |      |
| subDao                | mut        | no     |      |
| prevDaoEpochInfo      | immut      | no     |      |
| daoEpochInfo          | mut        | no     |      |
| subDaoEpochInfo       | mut        | no     |      |
| systemProgram         | immut      | no     |      |
| tokenProgram          | immut      | no     |      |
| circuitBreakerProgram | immut      | no     |      |

#### Args

| Name | Type                        | Docs |
| ---- | --------------------------- | ---- |
| args | CalculateUtilityScoreArgsV0 |      |

### issueRewardsV0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| dao                   | immut      | no     |      |
| subDao                | mut        | no     |      |
| daoEpochInfo          | mut        | no     |      |
| subDaoEpochInfo       | mut        | no     |      |
| hntCircuitBreaker     | mut        | no     |      |
| dntCircuitBreaker     | mut        | no     |      |
| hntMint               | mut        | no     |      |
| dntMint               | mut        | no     |      |
| treasury              | mut        | no     |      |
| rewardsEscrow         | mut        | no     |      |
| delegatorPool         | mut        | no     |      |
| systemProgram         | immut      | no     |      |
| tokenProgram          | immut      | no     |      |
| circuitBreakerProgram | immut      | no     |      |

#### Args

| Name | Type               | Docs |
| ---- | ------------------ | ---- |
| args | IssueRewardsArgsV0 |      |

### delegateV0

#### Accounts

| Name                       | Mutability | Signer | Docs |
| -------------------------- | ---------- | ------ | ---- |
| payer                      | mut        | yes    |      |
| position                   | immut      | no     |      |
| mint                       | immut      | no     |      |
| positionTokenAccount       | immut      | no     |      |
| positionAuthority          | mut        | yes    |      |
| registrar                  | immut      | no     |      |
| dao                        | immut      | no     |      |
| subDao                     | mut        | no     |      |
| subDaoEpochInfo            | mut        | no     |      |
| closingTimeSubDaoEpochInfo | mut        | no     |      |
| genesisEndSubDaoEpochInfo  | mut        | no     |      |
| delegatedPosition          | mut        | no     |      |
| vsrProgram                 | immut      | no     |      |
| systemProgram              | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### closeDelegationV0

#### Accounts

| Name                       | Mutability | Signer | Docs |
| -------------------------- | ---------- | ------ | ---- |
| payer                      | mut        | yes    |      |
| position                   | immut      | no     |      |
| mint                       | immut      | no     |      |
| positionTokenAccount       | immut      | no     |      |
| positionAuthority          | mut        | yes    |      |
| registrar                  | immut      | no     |      |
| dao                        | immut      | no     |      |
| subDao                     | mut        | no     |      |
| delegatedPosition          | mut        | no     |      |
| subDaoEpochInfo            | mut        | no     |      |
| closingTimeSubDaoEpochInfo | mut        | no     |      |
| genesisEndSubDaoEpochInfo  | mut        | no     |      |
| vsrProgram                 | immut      | no     |      |
| systemProgram              | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### claimRewardsV0

#### Accounts

| Name                        | Mutability | Signer | Docs |
| --------------------------- | ---------- | ------ | ---- |
| position                    | immut      | no     |      |
| mint                        | immut      | no     |      |
| positionTokenAccount        | immut      | no     |      |
| positionAuthority           | mut        | yes    |      |
| registrar                   | immut      | no     |      |
| dao                         | immut      | no     |      |
| subDao                      | mut        | no     |      |
| delegatedPosition           | mut        | no     |      |
| dntMint                     | immut      | no     |      |
| subDaoEpochInfo             | immut      | no     |      |
| delegatorPool               | mut        | no     |      |
| delegatorAta                | mut        | no     |      |
| delegatorPoolCircuitBreaker | mut        | no     |      |
| vsrProgram                  | immut      | no     |      |
| systemProgram               | immut      | no     |      |
| circuitBreakerProgram       | immut      | no     |      |
| associatedTokenProgram      | immut      | no     |      |
| tokenProgram                | immut      | no     |      |

#### Args

| Name | Type               | Docs |
| ---- | ------------------ | ---- |
| args | ClaimRewardsArgsV0 |      |

### transferV0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| registrar               | immut      | no     |      |
| dao                     | immut      | no     |      |
| sourcePosition          | mut        | no     |      |
| sourceDelegatedPosition | immut      | no     |      |
| mint                    | immut      | no     |      |
| positionTokenAccount    | immut      | no     |      |
| positionAuthority       | immut      | yes    |      |
| targetPosition          | mut        | no     |      |
| targetDelegatedPosition | immut      | no     |      |
| depositMint             | immut      | no     |      |
| sourceVault             | mut        | no     |      |
| targetVault             | mut        | no     |      |
| vsrProgram              | immut      | no     |      |
| tokenProgram            | immut      | no     |      |
| associatedTokenProgram  | immut      | no     |      |

#### Args

| Name | Type           | Docs |
| ---- | -------------- | ---- |
| args | TransferArgsV0 |      |

### issueHstPoolV0

#### Accounts

| Name                  | Mutability | Signer | Docs |
| --------------------- | ---------- | ------ | ---- |
| dao                   | mut        | no     |      |
| daoEpochInfo          | mut        | no     |      |
| hntCircuitBreaker     | mut        | no     |      |
| hntMint               | mut        | no     |      |
| hstPool               | mut        | no     |      |
| systemProgram         | immut      | no     |      |
| tokenProgram          | immut      | no     |      |
| circuitBreakerProgram | immut      | no     |      |

#### Args

| Name | Type               | Docs |
| ---- | ------------------ | ---- |
| args | IssueHstPoolArgsV0 |      |

### resetLockupV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| registrar            | immut      | no     |      |
| dao                  | immut      | no     |      |
| position             | mut        | no     |      |
| delegatedPosition    | immut      | no     |      |
| mint                 | immut      | no     |      |
| positionTokenAccount | immut      | no     |      |
| positionAuthority    | immut      | yes    |      |
| vsrProgram           | immut      | no     |      |

#### Args

| Name | Type              | Docs |
| ---- | ----------------- | ---- |
| args | ResetLockupArgsV0 |      |

### trackDcOnboardingFeesV0

#### Accounts

| Name    | Mutability | Signer | Docs |
| ------- | ---------- | ------ | ---- |
| hemAuth | immut      | yes    |      |
| subDao  | mut        | no     |      |

#### Args

| Name | Type                        | Docs |
| ---- | --------------------------- | ---- |
| args | TrackDcOnboardingFeesArgsV0 |      |

## Accounts

### DaoV0

| Field               | Type                 |
| ------------------- | -------------------- |
| hntMint             | publicKey            |
| dcMint              | publicKey            |
| authority           | publicKey            |
| registrar           | publicKey            |
| hstPool             | publicKey            |
| netEmissionsCap     | u64                  |
| numSubDaos          | u32                  |
| emissionSchedule    | EmissionScheduleItem |
| hstEmissionSchedule | PercentItem          |
| bumpSeed            | u8                   |

### DaoEpochInfoV0

| Field                      | Type      |
| -------------------------- | --------- |
| doneCalculatingScores      | bool      |
| epoch                      | u64       |
| dao                        | publicKey |
| totalRewards               | u64       |
| currentHntSupply           | u64       |
| totalUtilityScore          | u128      |
| numUtilityScoresCalculated | u32       |
| numRewardsIssued           | u32       |
| doneIssuingRewards         | bool      |
| doneIssuingHstPool         | bool      |
| bumpSeed                   | u8        |

### DelegatedPositionV0

| Field               | Type      |
| ------------------- | --------- |
| mint                | publicKey |
| position            | publicKey |
| hntAmount           | u64       |
| subDao              | publicKey |
| lastClaimedEpoch    | u64       |
| startTs             | i64       |
| purged              | bool      |
| bumpSeed            | u8        |
| claimedEpochsBitmap | u128      |

### SubDaoEpochInfoV0

| Field                         | Type      |
| ----------------------------- | --------- |
| epoch                         | u64       |
| subDao                        | publicKey |
| dcBurned                      | u64       |
| vehntAtEpochStart             | u64       |
| vehntInClosingPositions       | u128      |
| fallRatesFromClosingPositions | u128      |
| delegationRewardsIssued       | u64       |
| utilityScore                  | u128      |
| rewardsIssuedAt               | i64       |
| bumpSeed                      | u8        |
| initialized                   | bool      |
| dcOnboardingFeesPaid          | u64       |

### SubDaoV0

| Field                            | Type                 |
| -------------------------------- | -------------------- |
| dao                              | publicKey            |
| dntMint                          | publicKey            |
| treasury                         | publicKey            |
| rewardsEscrow                    | publicKey            |
| delegatorPool                    | publicKey            |
| vehntDelegated                   | u128                 |
| vehntLastCalculatedTs            | i64                  |
| vehntFallRate                    | u128                 |
| authority                        | publicKey            |
| deprecatedActiveDeviceAggregator | publicKey            |
| dcBurnAuthority                  | publicKey            |
| onboardingDcFee                  | u64                  |
| emissionSchedule                 | EmissionScheduleItem |
| bumpSeed                         | u8                   |
| registrar                        | publicKey            |
| delegatorRewardsPercent          | u64                  |
| onboardingDataOnlyDcFee          | u64                  |
| dcOnboardingFeesPaid             | u64                  |
| activeDeviceAuthority            | publicKey            |

## Types

### WindowedCircuitBreakerConfigV0

| Field             | Type          |
| ----------------- | ------------- |
| windowSizeSeconds | u64           |
| thresholdType     | ThresholdType |
| threshold         | u64           |

### CalculateUtilityScoreArgsV0

| Field | Type |
| ----- | ---- |
| epoch | u64  |

### ClaimRewardsArgsV0

| Field | Type |
| ----- | ---- |
| epoch | u64  |

### ResetLockupArgsV0

| Field   | Type       |
| ------- | ---------- |
| kind    | LockupKind |
| periods | u32        |

### TransferArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### InitializeDaoArgsV0

| Field               | Type                 |
| ------------------- | -------------------- |
| authority           | publicKey            |
| emissionSchedule    | EmissionScheduleItem |
| hstEmissionSchedule | PercentItem          |
| netEmissionsCap     | u64                  |
| registrar           | publicKey            |

### InitializeSubDaoArgsV0

| Field                   | Type                 |
| ----------------------- | -------------------- |
| authority               | publicKey            |
| emissionSchedule        | EmissionScheduleItem |
| treasuryCurve           | Curve                |
| onboardingDcFee         | u64                  |
| dcBurnAuthority         | publicKey            |
| registrar               | publicKey            |
| delegatorRewardsPercent | u64                  |
| onboardingDataOnlyDcFee | u64                  |
| activeDeviceAuthority   | publicKey            |

### IssueHstPoolArgsV0

| Field | Type |
| ----- | ---- |
| epoch | u64  |

### IssueRewardsArgsV0

| Field | Type |
| ----- | ---- |
| epoch | u64  |

### TrackDcBurnArgsV0

| Field    | Type |
| -------- | ---- |
| dcBurned | u64  |
| bump     | u8   |

### TrackDcOnboardingFeesArgsV0

| Field  | Type   |
| ------ | ------ |
| amount | u64    |
| add    | bool   |
| symbol | string |

### UpdateDaoArgsV0

| Field               | Type            |
| ------------------- | --------------- |
| authority           | publicKey       |
| emissionSchedule    | [object Object] |
| hstEmissionSchedule | [object Object] |
| hstPool             | publicKey       |
| netEmissionsCap     | u64             |

### UpdateSubDaoArgsV0

| Field                   | Type            |
| ----------------------- | --------------- |
| authority               | publicKey       |
| emissionSchedule        | [object Object] |
| onboardingDcFee         | u64             |
| dcBurnAuthority         | publicKey       |
| registrar               | publicKey       |
| delegatorRewardsPercent | u64             |
| onboardingDataOnlyDcFee | u64             |
| activeDeviceAuthority   | publicKey       |

### UpdateSubDaoVeHntArgsV0

| Field                 | Type |
| --------------------- | ---- |
| vehntDelegated        | u128 |
| vehntLastCalculatedTs | i64  |
| vehntFallRate         | u128 |

### EmissionScheduleItem

| Field             | Type |
| ----------------- | ---- |
| startUnixTime     | i64  |
| emissionsPerEpoch | u64  |

### PercentItem

| Field         | Type |
| ------------- | ---- |
| startUnixTime | i64  |
| percent       | u8   |

### ThresholdType

| Variant  | Fields |
| -------- | ------ |
| Percent  |        |
| Absolute |        |

### LockupKind

| Variant  | Fields |
| -------- | ------ |
| None     |        |
| Cliff    |        |
| Constant |        |

### Curve

| Variant            | Fields  |
| ------------------ | ------- |
| ExponentialCurveV0 | k: u128 |
