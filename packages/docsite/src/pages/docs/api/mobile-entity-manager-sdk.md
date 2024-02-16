# Mobile Entity Manager SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### approveCarrierV0

#### Accounts

| Name      | Mutability | Signer | Docs |
| --------- | ---------- | ------ | ---- |
| subDao    | immut      | no     |      |
| authority | immut      | yes    |      |
| carrier   | mut        | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### initializeCarrierV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| carrier                | mut        | no     |      |
| subDao                 | immut      | no     |      |
| dntMint                | immut      | no     |      |
| collection             | mut        | no     |      |
| metadata               | mut        | no     |      |
| masterEdition          | mut        | no     |      |
| tokenAccount           | mut        | no     |      |
| source                 | mut        | no     |      |
| escrow                 | mut        | no     |      |
| tokenMetadataProgram   | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| rent                   | immut      | no     |      |

#### Args

| Name | Type                    | Docs |
| ---- | ----------------------- | ---- |
| args | InitializeCarrierArgsV0 |      |

### initializeSubscriberV0

#### Accounts

| Name                       | Mutability | Signer | Docs |
| -------------------------- | ---------- | ------ | ---- |
| payer                      | mut        | yes    |      |
| programApproval            | immut      | no     |      |
| carrier                    | immut      | no     |      |
| issuingAuthority           | immut      | yes    |      |
| collection                 | immut      | no     |      |
| collectionMetadata         | mut        | no     |      |
| collectionMasterEdition    | immut      | no     |      |
| entityCreator              | immut      | no     |      |
| dao                        | immut      | no     |      |
| subDao                     | immut      | no     |      |
| keyToAsset                 | mut        | no     |      |
| treeAuthority              | mut        | no     |      |
| recipient                  | immut      | no     |      |
| merkleTree                 | mut        | no     |      |
| bubblegumSigner            | immut      | no     |      |
| tokenMetadataProgram       | immut      | no     |      |
| logWrapper                 | immut      | no     |      |
| bubblegumProgram           | immut      | no     |      |
| compressionProgram         | immut      | no     |      |
| systemProgram              | immut      | no     |      |
| heliumEntityManagerProgram | immut      | no     |      |

#### Args

| Name | Type                       | Docs |
| ---- | -------------------------- | ---- |
| args | InitializeSubscriberArgsV0 |      |

### issueCarrierNftV0

#### Accounts

| Name                       | Mutability | Signer | Docs |
| -------------------------- | ---------- | ------ | ---- |
| payer                      | mut        | yes    |      |
| programApproval            | immut      | no     |      |
| carrier                    | immut      | no     |      |
| issuingAuthority           | immut      | yes    |      |
| collection                 | immut      | no     |      |
| collectionMetadata         | mut        | no     |      |
| collectionMasterEdition    | immut      | no     |      |
| entityCreator              | immut      | no     |      |
| dao                        | immut      | no     |      |
| subDao                     | immut      | no     |      |
| keyToAsset                 | mut        | no     |      |
| treeAuthority              | mut        | no     |      |
| recipient                  | immut      | no     |      |
| merkleTree                 | mut        | no     |      |
| bubblegumSigner            | immut      | no     |      |
| tokenMetadataProgram       | immut      | no     |      |
| logWrapper                 | immut      | no     |      |
| bubblegumProgram           | immut      | no     |      |
| compressionProgram         | immut      | no     |      |
| systemProgram              | immut      | no     |      |
| heliumEntityManagerProgram | immut      | no     |      |

#### Args

| Name | Type                  | Docs |
| ---- | --------------------- | ---- |
| args | IssueCarrierNftArgsV0 |      |

### revokeCarrierV0

#### Accounts

| Name      | Mutability | Signer | Docs |
| --------- | ---------- | ------ | ---- |
| subDao    | immut      | no     |      |
| authority | immut      | yes    |      |
| carrier   | mut        | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### updateCarrierTreeV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| payer              | mut        | yes    |      |
| carrier            | mut        | no     |      |
| treeConfig         | mut        | no     |      |
| newTreeAuthority   | mut        | no     |      |
| newMerkleTree      | mut        | no     |      |
| logWrapper         | immut      | no     |      |
| systemProgram      | immut      | no     |      |
| bubblegumProgram   | immut      | no     |      |
| compressionProgram | immut      | no     |      |

#### Args

| Name | Type                    | Docs |
| ---- | ----------------------- | ---- |
| args | UpdateCarrierTreeArgsV0 |      |

### updateCarrierV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| carrier         | mut        | no     |      |
| updateAuthority | mut        | yes    |      |

#### Args

| Name | Type                | Docs |
| ---- | ------------------- | ---- |
| args | UpdateCarrierArgsV0 |      |

## Accounts

### CarrierV0

| Field              | Type      |
| ------------------ | --------- |
| subDao             | publicKey |
| updateAuthority    | publicKey |
| issuingAuthority   | publicKey |
| collection         | publicKey |
| escrow             | publicKey |
| name               | string    |
| merkleTree         | publicKey |
| approved           | bool      |
| collectionBumpSeed | u8        |
| bumpSeed           | u8        |
| hexboostAuthority  | publicKey |

## Types

### InitializeCarrierArgsV0

| Field             | Type      |
| ----------------- | --------- |
| updateAuthority   | publicKey |
| issuingAuthority  | publicKey |
| hexboostAuthority | publicKey |
| name              | string    |
| metadataUrl       | string    |

### InitializeSubscriberArgsV0

| Field       | Type   |
| ----------- | ------ |
| entityKey   | bytes  |
| name        | string |
| metadataUrl | string |

### IssueCarrierNftArgsV0

| Field       | Type   |
| ----------- | ------ |
| metadataUrl | string |

### UpdateCarrierTreeArgsV0

| Field         | Type |
| ------------- | ---- |
| maxDepth      | u32  |
| maxBufferSize | u32  |

### UpdateCarrierArgsV0

| Field             | Type      |
| ----------------- | --------- |
| updateAuthority   | publicKey |
| issuingAuthority  | publicKey |
| hexboostAuthority | publicKey |
