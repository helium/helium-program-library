# Nft Voter SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeNftVoterV0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| payer         | mut        | yes    |      |
| nftVoter      | mut        | no     |      |
| collection    | immut      | no     |      |
| systemProgram | immut      | no     |      |

#### Args

| Name | Type                     | Docs |
| ---- | ------------------------ | ---- |
| args | InitializeNftVoterArgsV0 |      |

### relinquishVoteV0

#### Accounts

| Name            | Mutability | Signer | Docs                                              |
| --------------- | ---------- | ------ | ------------------------------------------------- |
| refund          | mut        | no     | Account to receive sol refund if marker is closed |
| marker          | mut        | no     |                                                   |
| nftVoter        | immut      | no     |                                                   |
| voter           | immut      | yes    |                                                   |
| mint            | immut      | no     |                                                   |
| metadata        | immut      | no     |                                                   |
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
| nftVoter        | immut      | no     |      |
| voter           | immut      | yes    |      |
| mint            | immut      | no     |      |
| metadata        | immut      | no     |      |
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

## Accounts

### NftVoterV0

| Field      | Type      |
| ---------- | --------- |
| authority  | publicKey |
| collection | publicKey |
| name       | string    |
| bumpSeed   | u8        |

### VoteMarkerV0

| Field    | Type      |
| -------- | --------- |
| voter    | publicKey |
| nftVoter | publicKey |
| proposal | publicKey |
| mint     | publicKey |
| choices  | u16       |
| bumpSeed | u8        |

## Types

### InitializeNftVoterArgsV0

| Field     | Type      |
| --------- | --------- |
| name      | string    |
| authority | publicKey |

### RelinquishVoteArgsV0

| Field  | Type |
| ------ | ---- |
| choice | u16  |

### VoteArgsV0

| Field  | Type |
| ------ | ---- |
| choice | u16  |

### Key

| Variant                   | Fields |
| ------------------------- | ------ |
| Uninitialized             |        |
| EditionV1                 |        |
| MasterEditionV1           |        |
| ReservationListV1         |        |
| MetadataV1                |        |
| ReservationListV2         |        |
| MasterEditionV2           |        |
| EditionMarker             |        |
| UseAuthorityRecord        |        |
| CollectionAuthorityRecord |        |
| TokenOwnedEscrow          |        |
| TokenRecord               |        |
| MetadataDelegate          |        |

### CollectionDetails

| Variant | Fields    |
| ------- | --------- |
| V1      | size: u64 |

### ProgrammableConfig

| Variant | Fields                    |
| ------- | ------------------------- |
| V1      | rule_set: [object Object] |

### UseMethod

| Variant  | Fields |
| -------- | ------ |
| Burn     |        |
| Multiple |        |
| Single   |        |

### TokenStandard

| Variant                 | Fields |
| ----------------------- | ------ |
| NonFungible             |        |
| FungibleAsset           |        |
| Fungible                |        |
| NonFungibleEdition      |        |
| ProgrammableNonFungible |        |
