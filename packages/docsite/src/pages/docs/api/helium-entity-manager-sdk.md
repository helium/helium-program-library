# Helium Entity Manager SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeRewardableEntityConfigV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| subDao                 | immut      | no     |      |
| authority              | immut      | yes    |      |
| rewardableEntityConfig | mut        | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type                                   | Docs |
| ---- | -------------------------------------- | ---- |
| args | InitializeRewardableEntityConfigArgsV0 |      |

### approveMakerV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| rewardableEntityConfig | immut      | no     |      |
| subDao                 | immut      | no     |      |
| dntMint                | immut      | no     |      |
| escrow                 | mut        | no     |      |
| authority              | immut      | yes    |      |
| maker                  | immut      | no     |      |
| makerApproval          | mut        | no     |      |
| systemProgram          | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### revokeMakerV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| refund                 | mut        | yes    |      |
| rewardableEntityConfig | immut      | no     |      |
| authority              | immut      | yes    |      |
| maker                  | immut      | no     |      |
| makerApproval          | mut        | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### approveProgramV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| payer           | mut        | yes    |      |
| dao             | immut      | no     |      |
| authority       | immut      | yes    |      |
| programApproval | mut        | no     |      |
| systemProgram   | immut      | no     |      |

#### Args

| Name | Type                 | Docs |
| ---- | -------------------- | ---- |
| args | ApproveProgramArgsV0 |      |

### revokeProgramV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| refund          | mut        | yes    |      |
| dao             | immut      | no     |      |
| authority       | immut      | yes    |      |
| programApproval | mut        | no     |      |
| systemProgram   | immut      | no     |      |

#### Args

| Name | Type                | Docs |
| ---- | ------------------- | ---- |
| args | RevokeProgramArgsV0 |      |

### initializeMakerV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| maker                  | mut        | no     |      |
| dao                    | immut      | no     |      |
| collection             | mut        | no     |      |
| metadata               | mut        | no     |      |
| masterEdition          | mut        | no     |      |
| tokenAccount           | mut        | no     |      |
| tokenMetadataProgram   | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| tokenProgram           | immut      | no     |      |

#### Args

| Name | Type                  | Docs |
| ---- | --------------------- | ---- |
| args | InitializeMakerArgsV0 |      |

### issueEntityV0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| payer                   | mut        | yes    |      |
| eccVerifier             | immut      | yes    |      |
| issuingAuthority        | immut      | yes    |      |
| collection              | immut      | no     |      |
| collectionMetadata      | mut        | no     |      |
| collectionMasterEdition | immut      | no     |      |
| maker                   | mut        | no     |      |
| entityCreator           | immut      | no     |      |
| dao                     | immut      | no     |      |
| keyToAsset              | mut        | no     |      |
| treeAuthority           | mut        | no     |      |
| recipient               | immut      | no     |      |
| merkleTree              | mut        | no     |      |
| bubblegumSigner         | immut      | no     |      |
| tokenMetadataProgram    | immut      | no     |      |
| logWrapper              | immut      | no     |      |
| bubblegumProgram        | immut      | no     |      |
| compressionProgram      | immut      | no     |      |
| systemProgram           | immut      | no     |      |

#### Args

| Name | Type              | Docs |
| ---- | ----------------- | ---- |
| args | IssueEntityArgsV0 |      |

### issueProgramEntityV0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| payer                   | mut        | yes    |      |
| programApprover         | immut      | yes    |      |
| programApproval         | immut      | no     |      |
| collectionAuthority     | immut      | yes    |      |
| collection              | immut      | no     |      |
| collectionMetadata      | mut        | no     |      |
| collectionMasterEdition | immut      | no     |      |
| entityCreator           | immut      | no     |      |
| dao                     | immut      | no     |      |
| keyToAsset              | mut        | no     |      |
| treeAuthority           | mut        | no     |      |
| recipient               | immut      | no     |      |
| merkleTree              | mut        | no     |      |
| bubblegumSigner         | immut      | no     |      |
| tokenMetadataProgram    | immut      | no     |      |
| logWrapper              | immut      | no     |      |
| bubblegumProgram        | immut      | no     |      |
| compressionProgram      | immut      | no     |      |
| systemProgram           | immut      | no     |      |

#### Args

| Name | Type                     | Docs |
| ---- | ------------------------ | ---- |
| args | IssueProgramEntityArgsV0 |      |

### issueNotEmittedEntityV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| authority              | immut      | yes    |      |
| dao                    | immut      | no     |      |
| entityCreator          | immut      | no     |      |
| keyToAsset             | mut        | no     |      |
| recipient              | mut        | no     |      |
| recipientAccount       | mut        | no     |      |
| mint                   | mut        | no     |      |
| metadata               | mut        | no     |      |
| masterEdition          | mut        | no     |      |
| tokenMetadataProgram   | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| instructions           | immut      | no     |      |
| noEmitProgram          | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### issueIotOperationsFundV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| authority              | immut      | yes    |      |
| dao                    | immut      | no     |      |
| entityCreator          | immut      | no     |      |
| keyToAsset             | mut        | no     |      |
| recipient              | immut      | no     |      |
| recipientAccount       | mut        | no     |      |
| mint                   | mut        | no     |      |
| metadata               | mut        | no     |      |
| masterEdition          | mut        | no     |      |
| tokenMetadataProgram   | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### onboardIotHotspotV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| dcFeePayer             | mut        | yes    |      |
| issuingAuthority       | immut      | yes    |      |
| iotInfo                | mut        | no     |      |
| hotspotOwner           | mut        | yes    |      |
| merkleTree             | immut      | no     |      |
| dcBurner               | mut        | no     |      |
| rewardableEntityConfig | immut      | no     |      |
| makerApproval          | immut      | no     |      |
| maker                  | immut      | no     |      |
| dao                    | immut      | no     |      |
| keyToAsset             | immut      | no     |      |
| subDao                 | mut        | no     |      |
| dcMint                 | mut        | no     |      |
| dc                     | immut      | no     |      |
| compressionProgram     | immut      | no     |      |
| dataCreditsProgram     | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| heliumSubDaosProgram   | immut      | no     |      |

#### Args

| Name | Type                    | Docs |
| ---- | ----------------------- | ---- |
| args | OnboardIotHotspotArgsV0 |      |

### onboardMobileHotspotV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| dcFeePayer             | mut        | yes    |      |
| issuingAuthority       | immut      | yes    |      |
| mobileInfo             | mut        | no     |      |
| hotspotOwner           | mut        | yes    |      |
| merkleTree             | immut      | no     |      |
| dcBurner               | mut        | no     |      |
| dntBurner              | mut        | no     |      |
| rewardableEntityConfig | immut      | no     |      |
| makerApproval          | immut      | no     |      |
| maker                  | immut      | no     |      |
| dao                    | immut      | no     |      |
| keyToAsset             | immut      | no     |      |
| subDao                 | mut        | no     |      |
| dcMint                 | mut        | no     |      |
| dntMint                | mut        | no     |      |
| dntPrice               | immut      | no     |      |
| dc                     | immut      | no     |      |
| compressionProgram     | immut      | no     |      |
| dataCreditsProgram     | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| heliumSubDaosProgram   | immut      | no     |      |

#### Args

| Name | Type                       | Docs |
| ---- | -------------------------- | ---- |
| args | OnboardMobileHotspotArgsV0 |      |

### updateRewardableEntityConfigV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| authority              | immut      | yes    |      |
| rewardableEntityConfig | mut        | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type                               | Docs |
| ---- | ---------------------------------- | ---- |
| args | UpdateRewardableEntityConfigArgsV0 |      |

### updateMakerV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| maker           | mut        | no     |      |
| updateAuthority | immut      | yes    |      |

#### Args

| Name | Type              | Docs |
| ---- | ----------------- | ---- |
| args | UpdateMakerArgsV0 |      |

### setMakerTreeV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| payer              | mut        | yes    |      |
| updateAuthority    | immut      | yes    |      |
| maker              | mut        | no     |      |
| treeAuthority      | mut        | no     |      |
| merkleTree         | mut        | no     |      |
| logWrapper         | immut      | no     |      |
| systemProgram      | immut      | no     |      |
| bubblegumProgram   | immut      | no     |      |
| compressionProgram | immut      | no     |      |

#### Args

| Name | Type               | Docs |
| ---- | ------------------ | ---- |
| args | SetMakerTreeArgsV0 |      |

### updateMakerTreeV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| payer              | mut        | yes    |      |
| maker              | mut        | no     |      |
| treeAuthority      | mut        | no     |      |
| newTreeAuthority   | mut        | no     |      |
| newMerkleTree      | mut        | no     |      |
| logWrapper         | immut      | no     |      |
| systemProgram      | immut      | no     |      |
| bubblegumProgram   | immut      | no     |      |
| compressionProgram | immut      | no     |      |

#### Args

| Name | Type                  | Docs |
| ---- | --------------------- | ---- |
| args | UpdateMakerTreeArgsV0 |      |

### updateIotInfoV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| dcFeePayer             | mut        | yes    |      |
| iotInfo                | mut        | no     |      |
| hotspotOwner           | mut        | yes    |      |
| merkleTree             | immut      | no     |      |
| treeAuthority          | immut      | no     |      |
| dcBurner               | mut        | no     |      |
| rewardableEntityConfig | immut      | no     |      |
| dao                    | immut      | no     |      |
| subDao                 | immut      | no     |      |
| dcMint                 | mut        | no     |      |
| dc                     | immut      | no     |      |
| bubblegumProgram       | immut      | no     |      |
| compressionProgram     | immut      | no     |      |
| dataCreditsProgram     | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type                | Docs |
| ---- | ------------------- | ---- |
| args | UpdateIotInfoArgsV0 |      |

### updateMobileInfoV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | immut      | yes    |      |
| dcFeePayer             | immut      | yes    |      |
| mobileInfo             | mut        | no     |      |
| hotspotOwner           | mut        | yes    |      |
| merkleTree             | immut      | no     |      |
| treeAuthority          | immut      | no     |      |
| dcBurner               | mut        | no     |      |
| rewardableEntityConfig | immut      | no     |      |
| dao                    | immut      | no     |      |
| subDao                 | immut      | no     |      |
| dcMint                 | mut        | no     |      |
| dc                     | immut      | no     |      |
| bubblegumProgram       | immut      | no     |      |
| compressionProgram     | immut      | no     |      |
| dataCreditsProgram     | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type                   | Docs |
| ---- | ---------------------- | ---- |
| args | UpdateMobileInfoArgsV0 |      |

### initializeDataOnlyV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| authority              | mut        | yes    |      |
| dataOnlyConfig         | mut        | no     |      |
| dao                    | immut      | no     |      |
| treeAuthority          | mut        | no     |      |
| merkleTree             | mut        | no     |      |
| collection             | mut        | no     |      |
| tokenAccount           | mut        | no     |      |
| masterEdition          | mut        | no     |      |
| metadata               | mut        | no     |      |
| tokenMetadataProgram   | immut      | no     |      |
| logWrapper             | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| bubblegumProgram       | immut      | no     |      |
| compressionProgram     | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |

#### Args

| Name | Type                     | Docs |
| ---- | ------------------------ | ---- |
| args | InitializeDataOnlyArgsV0 |      |

### issueDataOnlyEntityV0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| payer                   | mut        | yes    |      |
| eccVerifier             | immut      | yes    |      |
| collection              | immut      | no     |      |
| collectionMetadata      | mut        | no     |      |
| collectionMasterEdition | immut      | no     |      |
| dataOnlyConfig          | mut        | no     |      |
| entityCreator           | immut      | no     |      |
| dao                     | immut      | no     |      |
| keyToAsset              | mut        | no     |      |
| treeAuthority           | mut        | no     |      |
| recipient               | immut      | no     |      |
| merkleTree              | mut        | no     |      |
| dataOnlyEscrow          | mut        | no     |      |
| bubblegumSigner         | immut      | no     |      |
| tokenMetadataProgram    | immut      | no     |      |
| logWrapper              | immut      | no     |      |
| bubblegumProgram        | immut      | no     |      |
| compressionProgram      | immut      | no     |      |
| systemProgram           | immut      | no     |      |

#### Args

| Name | Type                      | Docs |
| ---- | ------------------------- | ---- |
| args | IssueDataOnlyEntityArgsV0 |      |

### onboardDataOnlyIotHotspotV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| dcFeePayer             | mut        | yes    |      |
| iotInfo                | mut        | no     |      |
| hotspotOwner           | mut        | yes    |      |
| merkleTree             | immut      | no     |      |
| dcBurner               | mut        | no     |      |
| rewardableEntityConfig | immut      | no     |      |
| dataOnlyConfig         | mut        | no     |      |
| dao                    | immut      | no     |      |
| keyToAsset             | immut      | no     |      |
| subDao                 | mut        | no     |      |
| dcMint                 | mut        | no     |      |
| dc                     | immut      | no     |      |
| compressionProgram     | immut      | no     |      |
| dataCreditsProgram     | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| heliumSubDaosProgram   | immut      | no     |      |

#### Args

| Name | Type                            | Docs |
| ---- | ------------------------------- | ---- |
| args | OnboardDataOnlyIotHotspotArgsV0 |      |

### updateDataOnlyTreeV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| payer              | mut        | yes    |      |
| dataOnlyConfig     | mut        | no     |      |
| oldTreeAuthority   | mut        | no     |      |
| newTreeAuthority   | mut        | no     |      |
| dataOnlyEscrow     | mut        | no     |      |
| newMerkleTree      | mut        | no     |      |
| logWrapper         | immut      | no     |      |
| systemProgram      | immut      | no     |      |
| bubblegumProgram   | immut      | no     |      |
| compressionProgram | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### setEntityActiveV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| activeDeviceAuthority  | immut      | yes    |      |
| rewardableEntityConfig | immut      | no     |      |
| subDao                 | mut        | no     |      |
| info                   | mut        | no     |      |
| heliumSubDaosProgram   | immut      | no     |      |

#### Args

| Name | Type                  | Docs |
| ---- | --------------------- | ---- |
| args | SetEntityActiveArgsV0 |      |

### tempPayMobileOnboardingFeeV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| dcFeePayer             | mut        | yes    |      |
| dcBurner               | mut        | no     |      |
| rewardableEntityConfig | immut      | no     |      |
| subDao                 | mut        | no     |      |
| dao                    | immut      | no     |      |
| dcMint                 | mut        | no     |      |
| dc                     | immut      | no     |      |
| keyToAsset             | immut      | no     |      |
| mobileInfo             | mut        | no     |      |
| dataCreditsProgram     | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| heliumSubDaosProgram   | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### RewardableEntityConfigV0

| Field              | Type             |
| ------------------ | ---------------- |
| authority          | publicKey        |
| symbol             | string           |
| subDao             | publicKey        |
| settings           | ConfigSettingsV0 |
| bumpSeed           | u8               |
| stakingRequirement | u64              |

### MakerV0

| Field              | Type      |
| ------------------ | --------- |
| updateAuthority    | publicKey |
| issuingAuthority   | publicKey |
| name               | string    |
| bumpSeed           | u8        |
| collection         | publicKey |
| merkleTree         | publicKey |
| collectionBumpSeed | u8        |
| dao                | publicKey |

### MakerApprovalV0

| Field                  | Type      |
| ---------------------- | --------- |
| rewardableEntityConfig | publicKey |
| maker                  | publicKey |
| bumpSeed               | u8        |

### DataOnlyConfigV0

| Field              | Type      |
| ------------------ | --------- |
| authority          | publicKey |
| bumpSeed           | u8        |
| collection         | publicKey |
| merkleTree         | publicKey |
| collectionBumpSeed | u8        |
| dao                | publicKey |
| newTreeDepth       | u32       |
| newTreeBufferSize  | u32       |
| newTreeSpace       | u64       |
| newTreeFeeLamports | u64       |

### ProgramApprovalV0

| Field     | Type      |
| --------- | --------- |
| dao       | publicKey |
| programId | publicKey |
| bumpSeed  | u8        |

### KeyToAssetV0

| Field            | Type             |
| ---------------- | ---------------- |
| dao              | publicKey        |
| asset            | publicKey        |
| entityKey        | bytes            |
| bumpSeed         | u8               |
| keySerialization | KeySerialization |

### IotHotspotInfoV0

| Field               | Type      |
| ------------------- | --------- |
| asset               | publicKey |
| bumpSeed            | u8        |
| location            | u64       |
| elevation           | i32       |
| gain                | i32       |
| isFullHotspot       | bool      |
| numLocationAsserts  | u16       |
| isActive            | bool      |
| dcOnboardingFeePaid | u64       |

### MobileHotspotInfoV0

| Field               | Type               |
| ------------------- | ------------------ |
| asset               | publicKey          |
| bumpSeed            | u8                 |
| location            | u64                |
| isFullHotspot       | bool               |
| numLocationAsserts  | u16                |
| isActive            | bool               |
| dcOnboardingFeePaid | u64                |
| deviceType          | MobileDeviceTypeV0 |

## Types

### ApproveProgramArgsV0

| Field     | Type      |
| --------- | --------- |
| programId | publicKey |

### InitializeDataOnlyArgsV0

| Field              | Type      |
| ------------------ | --------- |
| authority          | publicKey |
| newTreeDepth       | u32       |
| newTreeBufferSize  | u32       |
| newTreeSpace       | u64       |
| newTreeFeeLamports | u64       |
| name               | string    |
| metadataUrl        | string    |

### InitializeMakerArgsV0

| Field            | Type      |
| ---------------- | --------- |
| updateAuthority  | publicKey |
| issuingAuthority | publicKey |
| name             | string    |
| metadataUrl      | string    |

### InitializeRewardableEntityConfigArgsV0

| Field              | Type             |
| ------------------ | ---------------- |
| symbol             | string           |
| settings           | ConfigSettingsV0 |
| stakingRequirement | u64              |

### IssueDataOnlyEntityArgsV0

| Field     | Type  |
| --------- | ----- |
| entityKey | bytes |

### IssueEntityArgsV0

| Field     | Type  |
| --------- | ----- |
| entityKey | bytes |

### IssueProgramEntityArgsV0

| Field            | Type             |
| ---------------- | ---------------- |
| entityKey        | bytes            |
| keySerialization | KeySerialization |
| name             | string           |
| symbol           | string           |
| approverSeeds    | bytes            |
| metadataUrl      | string           |

### OnboardDataOnlyIotHotspotArgsV0

| Field       | Type            |
| ----------- | --------------- |
| dataHash    | [object Object] |
| creatorHash | [object Object] |
| root        | [object Object] |
| index       | u32             |
| location    | u64             |
| elevation   | i32             |
| gain        | i32             |

### OnboardIotHotspotArgsV0

| Field       | Type            |
| ----------- | --------------- |
| dataHash    | [object Object] |
| creatorHash | [object Object] |
| root        | [object Object] |
| index       | u32             |
| location    | u64             |
| elevation   | i32             |
| gain        | i32             |

### OnboardMobileHotspotArgsV0

| Field       | Type               |
| ----------- | ------------------ |
| dataHash    | [object Object]    |
| creatorHash | [object Object]    |
| root        | [object Object]    |
| index       | u32                |
| location    | u64                |
| deviceType  | MobileDeviceTypeV0 |

### RevokeProgramArgsV0

| Field     | Type      |
| --------- | --------- |
| programId | publicKey |

### SetEntityActiveArgsV0

| Field     | Type  |
| --------- | ----- |
| isActive  | bool  |
| entityKey | bytes |

### SetMakerTreeArgsV0

| Field         | Type |
| ------------- | ---- |
| maxDepth      | u32  |
| maxBufferSize | u32  |

### UpdateIotInfoArgsV0

| Field       | Type            |
| ----------- | --------------- |
| location    | u64             |
| elevation   | i32             |
| gain        | i32             |
| dataHash    | [object Object] |
| creatorHash | [object Object] |
| root        | [object Object] |
| index       | u32             |

### UpdateMakerTreeArgsV0

| Field         | Type |
| ------------- | ---- |
| maxDepth      | u32  |
| maxBufferSize | u32  |

### UpdateMakerArgsV0

| Field            | Type      |
| ---------------- | --------- |
| issuingAuthority | publicKey |
| updateAuthority  | publicKey |

### UpdateMobileInfoArgsV0

| Field       | Type            |
| ----------- | --------------- |
| location    | u64             |
| dataHash    | [object Object] |
| creatorHash | [object Object] |
| root        | [object Object] |
| index       | u32             |

### UpdateRewardableEntityConfigArgsV0

| Field              | Type            |
| ------------------ | --------------- |
| newAuthority       | publicKey       |
| settings           | [object Object] |
| stakingRequirement | u64             |

### DeviceFeesV0

| Field              | Type               |
| ------------------ | ------------------ |
| deviceType         | MobileDeviceTypeV0 |
| dcOnboardingFee    | u64                |
| locationStakingFee | u64                |

### DeviceFeesV1

| Field                  | Type               |
| ---------------------- | ------------------ |
| deviceType             | MobileDeviceTypeV0 |
| dcOnboardingFee        | u64                |
| locationStakingFee     | u64                |
| mobileOnboardingFeeUsd | u64                |
| reserved               | [object Object]    |

### MobileDeviceTypeV0

| Variant     | Fields |
| ----------- | ------ |
| Cbrs        |        |
| WifiIndoor  |        |
| WifiOutdoor |        |

### ConfigSettingsV0

| Variant        | Fields                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| IotConfig      | minGain: i32, maxGain: i32, fullLocationStakingFee: u64, dataonlyLocationStakingFee: u64 |
| MobileConfig   | fullLocationStakingFee: u64, dataonlyLocationStakingFee: u64                             |
| MobileConfigV1 | feesByDevice: [object Object]                                                            |
| MobileConfigV2 | feesByDevice: [object Object]                                                            |

### KeySerialization

| Variant | Fields |
| ------- | ------ |
| B58     |        |
| UTF8    |        |
