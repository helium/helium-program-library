# Voter Stake Registry SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeRegistrarV0

#### Accounts

| Name                    | Mutability | Signer | Docs                                                                                                                                                                                                                 |
| ----------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| registrar               | mut        | no     | The voting registrar. There can only be a single registrar per governance realm and governing mint.                                                                                                                  |
| collection              | mut        | no     |                                                                                                                                                                                                                      |
| metadata                | mut        | no     |                                                                                                                                                                                                                      |
| masterEdition           | mut        | no     |                                                                                                                                                                                                                      |
| tokenAccount            | mut        | no     |                                                                                                                                                                                                                      |
| realm                   | immut      | no     | An spl-governance realm realm is validated in the instruction: - realm is owned by the governance_program_id - realm_governing_token_mint must be the community or council mint - realm_authority is realm.authority |
| governanceProgramId     | immut      | no     | The program id of the spl-governance program the realm belongs to.                                                                                                                                                   |
| realmGoverningTokenMint | immut      | no     | Either the realm community mint or the council mint.                                                                                                                                                                 |
| realmAuthority          | immut      | yes    |                                                                                                                                                                                                                      |
| payer                   | mut        | yes    |                                                                                                                                                                                                                      |
| tokenMetadataProgram    | immut      | no     |                                                                                                                                                                                                                      |
| associatedTokenProgram  | immut      | no     |                                                                                                                                                                                                                      |
| systemProgram           | immut      | no     |                                                                                                                                                                                                                      |
| tokenProgram            | immut      | no     |                                                                                                                                                                                                                      |

#### Args

| Name | Type                      | Docs |
| ---- | ------------------------- | ---- |
| args | InitializeRegistrarArgsV0 |      |

### configureVotingMintV0

#### Accounts

| Name           | Mutability | Signer | Docs                                         |
| -------------- | ---------- | ------ | -------------------------------------------- |
| registrar      | mut        | no     |                                              |
| realmAuthority | immut      | yes    |                                              |
| mint           | immut      | no     | Tokens of this mint will produce vote weight |
| payer          | mut        | yes    |                                              |
| systemProgram  | immut      | no     |                                              |

#### Args

| Name | Type                      | Docs |
| ---- | ------------------------- | ---- |
| args | ConfigureVotingMintArgsV0 |      |

### initializePositionV0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| registrar               | mut        | no     |      |
| collection              | immut      | no     |      |
| collectionMetadata      | mut        | no     |      |
| collectionMasterEdition | immut      | no     |      |
| position                | mut        | no     |      |
| mint                    | mut        | no     |      |
| metadata                | mut        | no     |      |
| masterEdition           | mut        | no     |      |
| positionTokenAccount    | mut        | no     |      |
| recipient               | immut      | no     |      |
| vault                   | mut        | no     |      |
| payer                   | mut        | yes    |      |
| depositMint             | immut      | no     |      |
| systemProgram           | immut      | no     |      |
| tokenProgram            | immut      | no     |      |
| associatedTokenProgram  | immut      | no     |      |
| tokenMetadataProgram    | immut      | no     |      |

#### Args

| Name | Type                     | Docs |
| ---- | ------------------------ | ---- |
| args | InitializePositionArgsV0 |      |

### depositV0

#### Accounts

| Name             | Mutability | Signer | Docs |
| ---------------- | ---------- | ------ | ---- |
| registrar        | immut      | no     |      |
| position         | mut        | no     |      |
| vault            | mut        | no     |      |
| mint             | immut      | no     |      |
| depositToken     | mut        | no     |      |
| depositAuthority | immut      | yes    |      |
| tokenProgram     | immut      | no     |      |

#### Args

| Name | Type          | Docs |
| ---- | ------------- | ---- |
| args | DepositArgsV0 |      |

### withdrawV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| registrar            | immut      | no     |      |
| position             | mut        | no     |      |
| mint                 | immut      | no     |      |
| positionTokenAccount | immut      | no     |      |
| positionAuthority    | immut      | yes    |      |
| vault                | mut        | no     |      |
| depositMint          | immut      | no     |      |
| destination          | mut        | no     |      |
| tokenProgram         | immut      | no     |      |

#### Args

| Name | Type           | Docs |
| ---- | -------------- | ---- |
| args | WithdrawArgsV0 |      |

### closePositionV0

#### Accounts

| Name                 | Mutability | Signer | Docs |
| -------------------- | ---------- | ------ | ---- |
| solDestination       | mut        | no     |      |
| position             | mut        | no     |      |
| registrar            | immut      | no     |      |
| mint                 | mut        | no     |      |
| positionTokenAccount | mut        | no     |      |
| positionAuthority    | immut      | yes    |      |
| tokenProgram         | immut      | no     |      |
| tokenMetadataProgram | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### resetLockupV0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| registrar               | immut      | no     |      |
| positionUpdateAuthority | immut      | yes    |      |
| position                | mut        | no     |      |
| mint                    | immut      | no     |      |
| positionTokenAccount    | immut      | no     |      |
| positionAuthority       | immut      | yes    |      |

#### Args

| Name | Type              | Docs |
| ---- | ----------------- | ---- |
| args | ResetLockupArgsV0 |      |

### transferV0

#### Accounts

| Name                    | Mutability | Signer | Docs |
| ----------------------- | ---------- | ------ | ---- |
| registrar               | immut      | no     |      |
| positionUpdateAuthority | immut      | yes    |      |
| sourcePosition          | mut        | no     |      |
| mint                    | immut      | no     |      |
| positionTokenAccount    | immut      | no     |      |
| positionAuthority       | immut      | yes    |      |
| targetPosition          | mut        | no     |      |
| depositMint             | immut      | no     |      |
| sourceVault             | mut        | no     |      |
| targetVault             | mut        | no     |      |
| tokenProgram            | immut      | no     |      |
| associatedTokenProgram  | immut      | no     |      |

#### Args

| Name | Type           | Docs |
| ---- | -------------- | ---- |
| args | TransferArgsV0 |      |

### setTimeOffsetV0

#### Accounts

| Name           | Mutability | Signer | Docs |
| -------------- | ---------- | ------ | ---- |
| registrar      | mut        | no     |      |
| realmAuthority | immut      | yes    |      |

#### Args

| Name       | Type      | Docs |
| ---------- | --------- | ---- |
| timeOffset | undefined |      |

### relinquishVoteV0

#### Accounts

| Name                  | Mutability | Signer | Docs                                                                                                                                                                                                                             |
| --------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| registrar             | immut      | no     |                                                                                                                                                                                                                                  |
| voterWeightRecord     | mut        | no     |                                                                                                                                                                                                                                  |
| governance            | immut      | no     | Governance account the Proposal is for                                                                                                                                                                                           |
| proposal              | immut      | no     |                                                                                                                                                                                                                                  |
| voterTokenOwnerRecord | immut      | no     | TokenOwnerRecord of the voter who cast the original vote                                                                                                                                                                         |
| voterAuthority        | immut      | yes    | Authority of the voter who cast the original vote It can be either governing_token_owner or its delegate and must sign this instruction                                                                                          |
| voteRecord            | immut      | no     | The account is used to validate that it doesn't exist and if it doesn't then Anchor owner check throws error The check is disabled here and performed inside the instruction #[account(owner = registrar.governance_program_id)] |
| beneficiary           | mut        | no     |                                                                                                                                                                                                                                  |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### ledgerTransferPositionV0

#### Accounts

| Name                   | Mutability | Signer | Docs |
| ---------------------- | ---------- | ------ | ---- |
| payer                  | mut        | yes    |      |
| position               | immut      | no     |      |
| mint                   | mut        | no     |      |
| fromTokenAccount       | mut        | no     |      |
| toTokenAccount         | mut        | no     |      |
| from                   | immut      | yes    |      |
| to                     | immut      | yes    |      |
| approver               | immut      | yes    |      |
| systemProgram          | immut      | no     |      |
| tokenProgram           | immut      | no     |      |
| associatedTokenProgram | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### updateRegistrarAuthorityV0

#### Accounts

| Name                | Mutability | Signer | Docs |
| ------------------- | ---------- | ------ | ---- |
| registrar           | mut        | no     |      |
| realmAuthority      | immut      | yes    |      |
| realm               | immut      | no     |      |
| governanceProgramId | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

### voteV0

#### Accounts

| Name            | Mutability | Signer | Docs |
| --------------- | ---------- | ------ | ---- |
| payer           | mut        | yes    |      |
| marker          | mut        | no     |      |
| registrar       | immut      | no     |      |
| voter           | immut      | yes    |      |
| position        | mut        | no     |      |
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

### relinquishVoteV1

#### Accounts

| Name            | Mutability | Signer | Docs                                              |
| --------------- | ---------- | ------ | ------------------------------------------------- |
| refund          | mut        | no     | Account to receive sol refund if marker is closed |
| marker          | mut        | no     |                                                   |
| registrar       | immut      | no     |                                                   |
| voter           | immut      | yes    |                                                   |
| position        | mut        | no     |                                                   |
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
| args | RelinquishVoteArgsV1 |      |

### relinquishExpiredVoteV0

#### Accounts

| Name          | Mutability | Signer | Docs |
| ------------- | ---------- | ------ | ---- |
| marker        | mut        | no     |      |
| position      | mut        | no     |      |
| proposal      | immut      | no     |      |
| systemProgram | immut      | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### VoteMarkerV0

| Field        | Type      |
| ------------ | --------- |
| voter        | publicKey |
| registrar    | publicKey |
| proposal     | publicKey |
| mint         | publicKey |
| choices      | u16       |
| weight       | u128      |
| bumpSeed     | u8        |
| relinquished | bool      |

### MaxVoterWeightRecord

| Field                | Type            |
| -------------------- | --------------- |
| realm                | publicKey       |
| governingTokenMint   | publicKey       |
| maxVoterWeight       | u64             |
| maxVoterWeightExpiry | u64             |
| reserved             | [object Object] |

### NftVoteRecord

| Field               | Type      |
| ------------------- | --------- |
| proposal            | publicKey |
| nftMint             | publicKey |
| governingTokenOwner | publicKey |

### PositionV0

| Field                 | Type      |
| --------------------- | --------- |
| registrar             | publicKey |
| mint                  | publicKey |
| lockup                | Lockup    |
| amountDepositedNative | u64       |
| votingMintConfigIdx   | u8        |
| numActiveVotes        | u16       |
| genesisEnd            | i64       |
| bumpSeed              | u8        |
| voteController        | publicKey |

### Registrar

| Field                   | Type               |
| ----------------------- | ------------------ |
| governanceProgramId     | publicKey          |
| realm                   | publicKey          |
| realmGoverningTokenMint | publicKey          |
| realmAuthority          | publicKey          |
| timeOffset              | i64                |
| positionUpdateAuthority | publicKey          |
| collection              | publicKey          |
| bumpSeed                | u8                 |
| collectionBumpSeed      | u8                 |
| reserved1               | [object Object]    |
| reserved2               | [object Object]    |
| votingMints             | VotingMintConfigV0 |

### VoterWeightRecord

| Field               | Type            |
| ------------------- | --------------- |
| realm               | publicKey       |
| governingTokenMint  | publicKey       |
| governingTokenOwner | publicKey       |
| voterWeight         | u64             |
| voterWeightExpiry   | u64             |
| weightAction        | [object Object] |
| weightActionTarget  | publicKey       |
| reserved            | [object Object] |

## Types

### ConfigureVotingMintArgsV0

| Field                                  | Type |
| -------------------------------------- | ---- |
| idx                                    | u16  |
| baselineVoteWeightScaledFactor         | u64  |
| maxExtraLockupVoteWeightScaledFactor   | u64  |
| genesisVotePowerMultiplier             | u8   |
| genesisVotePowerMultiplierExpirationTs | i64  |
| lockupSaturationSecs                   | u64  |

### DepositArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### InitializePositionArgsV0

| Field   | Type       |
| ------- | ---------- |
| kind    | LockupKind |
| periods | u32        |

### InitializeRegistrarArgsV0

| Field                   | Type      |
| ----------------------- | --------- |
| positionUpdateAuthority | publicKey |

### RelinquishVoteArgsV1

| Field  | Type |
| ------ | ---- |
| choice | u16  |

### ResetLockupArgsV0

| Field   | Type       |
| ------- | ---------- |
| kind    | LockupKind |
| periods | u32        |

### TransferArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### VoteArgsV0

| Field  | Type |
| ------ | ---- |
| choice | u16  |

### WithdrawArgsV0

| Field  | Type |
| ------ | ---- |
| amount | u64  |

### Lockup

| Field   | Type       |
| ------- | ---------- |
| startTs | i64        |
| endTs   | i64        |
| kind    | LockupKind |

### VotingMintConfigV0

| Field                                  | Type      |
| -------------------------------------- | --------- |
| mint                                   | publicKey |
| baselineVoteWeightScaledFactor         | u64       |
| maxExtraLockupVoteWeightScaledFactor   | u64       |
| genesisVotePowerMultiplier             | u8        |
| genesisVotePowerMultiplierExpirationTs | i64       |
| lockupSaturationSecs                   | u64       |
| reserved                               | i8        |

### LockupKind

| Variant  | Fields |
| -------- | ------ |
| None     |        |
| Cliff    |        |
| Constant |        |

### VoterWeightAction

| Variant          | Fields |
| ---------------- | ------ |
| CastVote         |        |
| CommentProposal  |        |
| CreateGovernance |        |
| CreateProposal   |        |
| SignOffProposal  |        |
