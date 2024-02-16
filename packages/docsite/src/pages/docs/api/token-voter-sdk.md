# Token Voter SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeTokenVoterV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| tokenVoter             | mut        | no     |      |
| collection             | mut        | no     |      |
| metadata               | mut        | no     |      |
| masterEdition          | mut        | no     |      |
| tokenAccount           | mut        | no     |      |
| mint                   | immut      | no     |      |
| rent                   | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| tokenMetadataProgram   | immut      | no     |      |
| systemProgram          | immut      | no     |      |

#### Args

| Name | Type                       | Docs |
| ---- | -------------------------- | ---- |
| args | InitializeTokenVoterArgsV0 |      |

### depositV0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| tokenVoter              | immut      | no     |      |
| collection              | immut      | no     |      |
| collectionMetadata      | mut        | no     |      |
| collectionMasterEdition | mut        | no     |      |
| receipt                 | mut        | no     |      |
| mint                    | mut        | no     |      |
| metadata                | mut        | no     |      |
| masterEdition           | mut        | no     |      |
| receiptTokenAccount     | mut        | no     |      |
| recipient               | immut      | no     |      |
| vault                   | mut        | no     |      |
| tokenAccount            | mut        | no     |      |
| payer                   | mut        | yes    |      |
| depositMint             | immut      | no     |      |
| systemProgram           | immut      | no     |      |
| tokenProgram            | immut      | no     |      |
| associatedTokenProgram  | immut      | no     |      |
| tokenMetadataProgram    | immut      | no     |      |
| rent                    | immut      | no     |      |

#### Args

| Name | Type          | Docs |
| ---- | ------------- | ---- |
| args | DepositArgsV0 |      |

### relinquishVoteV0

#### Accounts

| Name            | Mutability | Signer | Docs                                              |
| --------------- | ---------- | ------ | ------------------------------------------------- |
| refund          | mut        | no     | Account to receive sol refund if marker is closed |
| marker          | mut        | no     |                                                   |
| tokenVoter      | immut      | no     |                                                   |
| voter           | immut      | yes    |                                                   |
| receipt         | mut        | no     |                                                   |
| mint            | immut      | no     |                                                   |
| tokenAccount    | immut      | no     |                                                   |
| proposal        | mut        | no     |                                                   |
| proposalConfig  | immut      | no     |                                                   |
| stateController | mut        | no     |                                                   |
| onVoteHook      | immut      | no     |                                                   |
| proposalProgram | immut      | no     |                                                   |
| systemProgram   | immut      | no     |                                                   |

#### Args

| Name | Type                 | Docs |
| ---- | -------------------- | ---- |
| args | RelinquishVoteArgsV0 |      |

### voteV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| payer           | mut        | yes    |      |
| marker          | mut        | no     |      |
| tokenVoter      | immut      | no     |      |
| voter           | immut      | yes    |      |
| receipt         | mut        | no     |      |
| mint            | immut      | no     |      |
| tokenAccount    | immut      | no     |      |
| proposal        | mut        | no     |      |
| proposalConfig  | immut      | no     |      |
| stateController | mut        | no     |      |
| onVoteHook      | immut      | no     |      |
| proposalProgram | immut      | no     |      |
| systemProgram   | immut      | no     |      |

#### Args

| Name | Type       | Docs |
| ---- | ---------- | ---- |
| args | VoteArgsV0 |      |

### withdrawV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| tokenVoter             | immut      | no     |      |
| collection             | immut      | no     |      |
| collectionMetadata     | mut        | no     |      |
| receipt                | mut        | no     |      |
| mint                   | mut        | no     |      |
| metadata               | mut        | no     |      |
| masterEdition          | mut        | no     |      |
| receiptTokenAccount    | mut        | no     |      |
| vault                  | mut        | no     |      |
| tokenAccount           | mut        | no     |      |
| payer                  | mut        | yes    |      |
| refund                 | mut        | no     |      |
| owner                  | immut      | yes    |      |
| depositMint            | immut      | no     |      |
| systemProgram          | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |
| tokenMetadataProgram   | immut      | no     |      |
| rent                   | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### TokenVoterV0

| Field       | Type      |
| ----------- | --------- |
| authority   | publicKey |
| depositMint | publicKey |
| collection  | publicKey |
| name        | string    |
| bumpSeed    | u8        |

### ReceiptV0

| Field          | Type      |
| -------------- | --------- |
| tokenVoter     | publicKey |
| mint           | publicKey |
| amount         | u64       |
| numActiveVotes | u64       |
| bumpSeed       | u8        |

### VoteMarkerV0

| Field      | Type      |
| ---------- | --------- |
| voter      | publicKey |
| tokenVoter | publicKey |
| proposal   | publicKey |
| mint       | publicKey |
| choices    | u16       |
| bumpSeed   | u8        |

## Types

### DepositArgsV0

| Field       | Type   |
| ----------- | ------ |
| amount      | u64    |
| metadataUri | string |

### InitializeTokenVoterArgsV0

| Field         | Type      |
| ------------- | --------- |
| name          | string    |
| authority     | publicKey |
| collectionUri | string    |

### RelinquishVoteArgsV0

| Field  | Type |
| ------ | ---- |
| choice | u16  |

### VoteArgsV0

| Field  | Type |
| ------ | ---- |
| choice | u16  |

### UseMethod

| Variant  | Fields |
| -------- | ------ |
| Burn     |        |
| Multiple |        |
| Single   |        |

### CollectionDetails

| Variant | Fields    |
| ------- | --------- |
| V1      | size: u64 |
