# Organization Wallet SDK

{% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

### initializeOrganizationWalletV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| payer              | mut        | yes    |      |
| organizationWallet | mut        | no     |      |
| organization       | immut      | no     |      |
| authority          | immut      | yes    |      |
| systemProgram      | immut      | no     |      |

#### Args

| Name | Type                               | Docs |
| ---- | ---------------------------------- | ---- |
| args | InitializeOrganizationWalletArgsV0 |      |

### setTransactionsV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| payer              | mut        | yes    |      |
| owner              | immut      | yes    |      |
| organizationWallet | immut      | no     |      |
| proposal           | immut      | no     |      |
| walletProposal     | mut        | no     |      |
| choiceTransaction  | mut        | no     |      |
| systemProgram      | immut      | no     |      |

#### Args

| Name | Type                  | Docs |
| ---- | --------------------- | ---- |
| args | SetTransactionsArgsV0 |      |

### executeTransactionV0

#### Accounts

| Name               | Mutability | Signer | Docs |
| ------------------ | ---------- | ------ | ---- |
| organizationWallet | immut      | no     |      |
| proposal           | immut      | no     |      |
| choiceTransaction  | mut        | no     |      |
| wallet             | mut        | no     |      |
| refund             | mut        | no     |      |

#### Args

| Name | Type | Docs |
| ---- | ---- | ---- |

## Accounts

### OrganizationWalletV0

| Field           | Type      |
| --------------- | --------- |
| index           | u16       |
| organization    | publicKey |
| wallet          | publicKey |
| proposalConfigs | publicKey |
| name            | string    |
| bumpSeed        | u8        |
| walletBumpSeed  | u8        |

### WalletProposalV0

| Field                   | Type      |
| ----------------------- | --------- |
| proposal                | publicKey |
| organizationWallet      | publicKey |
| numTransactionsByChoice | u16       |

### ChoiceTransactionV0

| Field                  | Type                  |
| ---------------------- | --------------------- |
| walletProposal         | publicKey             |
| proposal               | publicKey             |
| organizationWallet     | publicKey             |
| choiceIndex            | u16                   |
| allowExecutionOffset   | u32                   |
| disableExecutionOffset | u32                   |
| bumpSeed               | u8                    |
| transaction            | CompiledTransactionV0 |

### OrganizationWalletPropoalV0

| Field                | Type            |
| -------------------- | --------------- |
| organizationWallet   | publicKey       |
| proposal             | publicKey       |
| accounts             | publicKey       |
| transactionsByChoice | [object Object] |
| bumpSeed             | u8              |

## Types

### InitializeOrganizationWalletArgsV0

| Field           | Type      |
| --------------- | --------- |
| name            | string    |
| proposalConfigs | publicKey |
| index           | u16       |

### CompiledTransactionArgV0

| Field        | Type                  |
| ------------ | --------------------- |
| numRwSigners | u8                    |
| numRoSigners | u8                    |
| numRw        | u8                    |
| instructions | CompiledInstructionV0 |
| signerSeeds  | bytes                 |

### SetTransactionsArgsV0

| Field                  | Type                     |
| ---------------------- | ------------------------ |
| choiceIndex            | u16                      |
| transactionIndex       | u16                      |
| allowExecutionOffset   | u32                      |
| disableExecutionOffset | u32                      |
| transaction            | CompiledTransactionArgV0 |

### CompiledInstructionV0

| Field          | Type  |
| -------------- | ----- |
| programIdIndex | u8    |
| accounts       | bytes |
| data           | bytes |

### CompiledTransactionV0

| Field        | Type                  |
| ------------ | --------------------- |
| numRwSigners | u8                    |
| numRoSigners | u8                    |
| numRw        | u8                    |
| accounts     | publicKey             |
| instructions | CompiledInstructionV0 |
| signerSeeds  | bytes                 |
